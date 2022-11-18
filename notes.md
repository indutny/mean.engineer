# WebFinger

Looks like host metadata is requested if web finger 404s.

https://webconcepts.info/specs/IETF/RFC/6415

# Inbox/outbox

POST to a shared inbox for whole server, otherwise to inbox for each recipient.

POST to outbox to send messages.

# Objects

Always has `"@context": "https://www.w3.org/ns/activitystreams",`. Keys are
taken from https://www.w3.org/TR/activitystreams-vocabulary/#dfn-summary, unless
context is something like:

```js
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "key": "uri-to-scheme"
    }
  ],
}
```

Each actvitity must have a "type": https://www.w3.org/TR/activitystreams-vocabulary/#activity-types
and "summary" (?), "actor" and an "object".

Every JSON has down-level type of "Object" or "Link" ("Activity" is a subtype
of an "Object" and so on).

# IRI

Instead of URI it uses IRI: https://www.rfc-editor.org/rfc/rfc3987#section-3.1

# Timestamps

Seconds can be omitted: `2022-11-18T08:53:15.338Z` or `2022-11-18T08:53Z`

# Useful curls

```
curl https://fosstodon.org/.well-known/webfinger?resource=acct:indutny@fosstodon.org
curl -H "Accept: application/activity+json" https://fosstodon.org/users/indutny
```
