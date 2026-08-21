const router = require('express').Router();

router.get('/', (_request, response) => {
  response.json({ status: 'ok' });
});

module.exports = router;
