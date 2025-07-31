require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Op } = require('sequelize');

const sequelize = require('./config/database');
const Peca = require('./models/Peca');

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

// Configura o Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configura o storage do Multer para o Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'amavi',
    format: async (req, file) => 'png',
    public_id: (req, file) => `${file.fieldname}-${Date.now()}`
  },
});

const upload = multer({ storage: storage });

// Middlewares
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'mysecret',
  resave: false,
  saveUninitialized: true
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Rotas Públicas ---

app.get('/', async (req, res) => {
  try {
    const { tipo } = req.query;
    const where = tipo ? { tipo: tipo } : {};
    const pecas = await Peca.findAll({ where });
    res.render('index', { pecas: pecas, selectedType: tipo });
  } catch (error) {
    console.error('Erro ao buscar peças:', error);
    res.status(500).send('Erro no servidor.');
  }
});

// --- Rotas de Admin ---

app.get('/admin/login', (req, res) => {
  res.render('login');
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  // Lógica de autenticação (pode ser movida para um model de User no futuro)
  if (username === process.env.ADMIN_USERNAME) {
    const passwordHash = process.env.ADMIN_PASSWORD_HASH; // Supondo que o hash está no .env
    const match = await bcrypt.compare(password, passwordHash);
    if (match) {
      req.session.loggedin = true;
      res.redirect('/admin');
    } else {
      res.send('Usuário ou senha incorretos!');
    }
  } else {
    res.send('Usuário ou senha incorretos!');
  }
});

// Middleware para proteger rotas de admin
const checkAuth = (req, res, next) => {
  if (req.session.loggedin) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

app.get('/admin', checkAuth, async (req, res) => {
  try {
    const { nome } = req.query;
    const where = nome ? { nome: { [Op.iLike]: `%${nome}%` } } : {};
    const pecas = await Peca.findAll({ where });
    res.render('admin', { pecas: pecas, filterName: nome });
  } catch (error) {
    console.error('Erro ao buscar peças para admin:', error);
    res.status(500).send('Erro no servidor.');
  }
});

app.get('/admin/pecas/nova', checkAuth, (req, res) => {
  res.render('nova-peca');
});

app.post('/admin/pecas/nova', checkAuth, upload.single('imagem'), async (req, res) => {
  try {
    const { nome, preco, tipo } = req.body;
    if (!req.file) {
      return res.status(400).send('Imagem é obrigatória.');
    }

    const novaPeca = await Peca.create({
      nome,
      preco: parseFloat(preco),
      tipo,
      imagem: req.file.path, // URL do Cloudinary
      status: 'disponivel'
    });

    res.redirect('/admin');
  } catch (error) {
    console.error('Erro ao criar nova peça:', error);
    // Se der erro, tenta deletar a imagem que já foi enviada para o Cloudinary
    if (req.file) {
      cloudinary.uploader.destroy(req.file.filename);
    }
    res.status(500).send('Erro ao criar a peça.');
  }
});

app.get('/admin/pecas/editar/:id', checkAuth, async (req, res) => {
  try {
    const peca = await Peca.findByPk(req.params.id);
    if (peca) {
      res.render('editar-peca', { peca: peca });
    } else {
      res.status(404).send('Peça não encontrada.');
    }
  } catch (error) {
    console.error('Erro ao buscar peça para edição:', error);
    res.status(500).send('Erro no servidor.');
  }
});

app.post('/admin/pecas/editar/:id', checkAuth, upload.single('imagem'), async (req, res) => {
  try {
    const { nome, preco, tipo, status } = req.body;
    const peca = await Peca.findByPk(req.params.id);

    if (!peca) {
      return res.status(404).send('Peça não encontrada.');
    }

    // Se uma nova imagem for enviada, deleta a antiga do Cloudinary
    if (req.file && peca.imagem) {
        const publicId = peca.imagem.split('/').pop().split('.')[0];
        cloudinary.uploader.destroy(publicId);
    }

    await peca.update({
      nome,
      preco: parseFloat(preco),
      tipo,
      status,
      imagem: req.file ? req.file.path : peca.imagem // Mantém a imagem antiga se nenhuma nova for enviada
    });

    res.redirect('/admin');
  } catch (error) {
    console.error('Erro ao editar peça:', error);
    res.status(500).send('Erro ao editar a peça.');
  }
});

app.get('/admin/pecas/excluir/:id', checkAuth, async (req, res) => {
  try {
    const peca = await Peca.findByPk(req.params.id);

    if (!peca) {
      return res.status(404).send('Peça não encontrada.');
    }

    // Deleta a imagem do Cloudinary
    if (peca.imagem) {
        const publicId = peca.imagem.split('/').pop().split('.')[0];
        cloudinary.uploader.destroy(publicId);
    }

    await peca.destroy();

    res.redirect('/admin');
  } catch (error) {
    console.error('Erro ao excluir peça:', error);
    res.status(500).send('Erro ao excluir a peça.');
  }
});

// Função para iniciar o servidor
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexão com o banco de dados estabelecida com sucesso.');

    // Sincroniza os models com o banco de dados (cria as tabelas se não existirem)
    await sequelize.sync({ alter: true });
    console.log('Tabelas sincronizadas.');

    // Gera o hash da senha do admin se não estiver no .env
    if (!process.env.ADMIN_PASSWORD_HASH) {
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, saltRounds);
        console.log('--- HASH DA SENHA DO ADMIN ---');
        console.log('Copie esta linha para o seu arquivo .env:');
        console.log(`ADMIN_PASSWORD_HASH=${hashedPassword}`);
        console.log('--------------------------------');
    }

    app.listen(port, () => {
      console.log(`Servidor rodando na porta ${port}`);
    });
  } catch (error) {
    console.error('Não foi possível conectar ao banco de dados:', error);
  }
};

startServer();