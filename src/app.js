const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const healthRoutes = require('./routes/health.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_request, response) => {
  response.json({ name: 'flow-management-benchmark', status: 'running' });
});

app.use('/health', healthRoutes);

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

module.exports = app;
