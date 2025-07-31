require('dotenv').config();
const { Sequelize } = require('sequelize');

// A string de conexão do Pooler do Supabase já é compatível com IPv4.
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

module.exports = sequelize;