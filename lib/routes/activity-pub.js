export default (app) => {
  app.get('/users/:user', (req, res) => {
    const { accept } = req.headers;
    if (!accept.startsWith('application/activity+json')) {
      res.status(404).send('HTML interface not implemented');
      return;
    }

    res.send(404).send({ error: 'not implemented' });
  });
};
