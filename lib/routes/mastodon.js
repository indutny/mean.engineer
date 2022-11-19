import {
  HOST,
  SERVER_TITLE,
  SERVER_SHORT_DESCRIPTION,
  SERVER_DESCRIPTION,
  SERVER_LANGUAGES,
  SERVER_VERSION,
  EMAIL,
  RULES,
  SUPPORTED_MIME_TYPES,
  MAX_CHARACTERS,
  MAX_ATTACHMENTS,
} from '../config.js';

export default (app) => {
  app.get('/api/v1/instance', (req, res) => {
    res.send({
      uri: HOST,
      title: TITLE,
      short_description: SERVER_SHORT_DESCRIPTION,
      description: SERVER_DESCRIPTION,
      email: EMAIL,
      version: SERVER_VERSION,
      urls: {
        streaming_api: `wss://${HOST}`
      },
      stats: {
        user_count: 1,
        status_count: 0,
        domain_count: 0,
      },
      // TODO(indutny): add this
      thumbnail: null,
      languages: SERVER_LANGUAGES,
      registrations: false,
      approval_required: true,
      invites_enabled: false,
      configuration: {
        'accounts': {
          // TODO(indutny): make this configurable
          'max_featured_tags': 10
        },
        'statuses': {
          'max_characters': MAX_CHARACTERS,
          'max_media_attachments': MAX_ATTACHMENTS,

          // TODO(indutny): make this configurable
          'characters_reserved_per_url': 23
        },
        'media_attachments': {
          'supported_mime_types': SUPPORTED_MIME_TYPES,

          // TODO(indutny): make these configurable
          'image_size_limit': 10485760,
          'image_matrix_limit': 16777216,
          'video_size_limit': 41943040,
          'video_frame_rate_limit': 60,
          'video_matrix_limit': 2304000
        },
      },
      // TODO(indutny): add this
      contact_account: null,
      rules: RULES.map((text, id) => {
        return { id: id.toString(), text };
      }),
    });
  });
};
