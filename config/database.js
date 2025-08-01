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
    },
    native: false, // Força o Sequelize a não usar o driver nativo do pg, permitindo typeCast
    typeCast: true // Habilita o type casting para converter tipos de banco de dados para tipos JS
  }
});

module.exports = sequelize;