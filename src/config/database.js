const { Sequelize } = require('sequelize');
const env = require('./env');

const sequelize = new Sequelize(
  env.databaseUrl || {
    database: process.env.POSTGRES_DB || 'flow_management',
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    dialect: 'postgres',
    logging: false,
  },
);

module.exports = sequelize;
