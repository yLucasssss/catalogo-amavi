
const fs = require('fs').promises;
const path = require('path');
const sequelize = require('./config/database');
const Peca = require('./models/Peca');

async function migrate() {
  try {
    console.log('Iniciando conexão com o banco de dados...');
    await sequelize.authenticate();
    console.log('Conexão bem-sucedida.');

    console.log('Sincronizando o modelo Peca...');
    await Peca.sync({ alter: true });
    console.log('Modelo Peca sincronizado.');

    const dataPath = path.join(__dirname, 'data', 'pecas.json');
    console.log(`Lendo dados de ${dataPath}...`);
    const data = await fs.readFile(dataPath, 'utf8');
    const pecas = JSON.parse(data);

    if (pecas.length === 0) {
      console.log('Nenhuma peça encontrada no arquivo JSON. Encerrando a migração.');
      return;
    }

    console.log(`Encontradas ${pecas.length} peças para migrar.`)

    for (const peca of pecas) {
      try {
        const [dbPeca, created] = await Peca.findOrCreate({
          where: { nome: peca.nome },
          defaults: {
            valor: peca.valor,
            disponibilidade: peca.disponibilidade || 'disponível',
            tipo: peca.tipo,
            tamanho: peca.tamanho,
            imagem: peca.imagem
          }
        });

        if (created) {
          console.log(`Peça "${dbPeca.nome}" criada com sucesso.`);
        } else {
          console.log(`Peça "${dbPeca.nome}" já existe no banco de dados. Pulando.`);
        }
      } catch (error) {
        console.error(`Erro ao migrar a peça "${peca.nome}":`, error.message);
      }
    }

    console.log('Migração de dados concluída.');

  } catch (error) {
    console.error('Ocorreu um erro durante a migração:', error);
  } finally {
    await sequelize.close();
    console.log('Conexão com o banco de dados fechada.');
  }
}

migrate();
