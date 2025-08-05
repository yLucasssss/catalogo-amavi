
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Peca = sequelize.define('Peca', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  valor: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  disponibilidade: {
    type: DataTypes.STRING,
    defaultValue: 'disponível'
  },
  tipo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  tamanho: {
    type: DataTypes.STRING,
    allowNull: true
  },
  imagem: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = Peca;
