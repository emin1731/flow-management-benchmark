const app = require('./app');
const sequelize = require('./config/database');
const env = require('./config/env');

const startServer = async () => {
  try {
    await sequelize.authenticate();
    app.listen(env.port, () => {
      console.log(`Server listening on port ${env.port}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error.message);
    process.exitCode = 1;
  }
};

startServer();
