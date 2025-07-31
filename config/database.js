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
  },
  define: {
    // Adiciona um parser para tipos NUMERIC para garantir que sejam retornados como números
    // Isso é crucial para evitar que valores decimais sejam retornados como strings
    typeMapping: {
      'NUMERIC': function(value) {
        return parseFloat(value);
      }
    }
  }
});

module.exports = sequelize;