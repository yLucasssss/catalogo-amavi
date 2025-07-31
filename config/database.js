require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  host: 'db.nreraxgrdellhgrgxzgr.supabase.co', // Manter o host aqui
  family: 4 // Forçar o uso de IPv4
});

module.exports = sequelize;