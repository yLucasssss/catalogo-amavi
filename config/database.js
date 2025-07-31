require('dotenv').config();
const { Sequelize } = require('sequelize');

// Extrai as partes da URL de conexão
const dbUrl = new URL(process.env.DATABASE_URL);

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: dbUrl.hostname,
  port: dbUrl.port,
  username: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.split('/')[1],
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  // Força o uso de IPv4
  family: 4
});

module.exports = sequelize;