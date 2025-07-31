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
    public_id: (req, file) => {
      // Usa o nome da peça (req.body.nome) como public_id para garantir unicidade
      // Limpa o nome para ser um public_id válido (sem espaços, caracteres especiais)
      const nomePeca = req.body.nome ? req.body.nome.toLowerCase().replace(/[^a-z0-9]/g, '') : Date.now();
      return `peca-${nomePeca}`;
    }
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

  if (username !== process.env.ADMIN_USERNAME) {
    return res.send('Usuário ou senha incorretos!');
  }

  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!passwordHash) {
    console.error('ERRO CRÍTICO: A variável de ambiente ADMIN_PASSWORD_HASH não está configurada.');
    return res.status(500).send('Erro de configuração do servidor. O administrador foi notificado.');
  }

  try {
    const match = await bcrypt.compare(password, passwordHash);

    if (match) {
      req.session.loggedin = true;
      res.redirect('/admin');
    } else {
      res.send('Usuário ou senha incorretos!');
    }
  } catch (error) {
    console.error('Erro ao comparar a senha com bcrypt:', error);
    res.status(500).send('Erro interno no processo de login.');
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
    const { nome, preco, tipo, tamanho } = req.body;

    // Validação de entrada (agora após o multer processar req.body)
    if (!nome || typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).send('O nome da peça é obrigatório e deve ser um texto válido.');
    }
    if (!preco || typeof preco !== 'string' || preco.trim() === '') {
      return res.status(400).send('O valor do preço é obrigatório e deve ser um texto válido.');
    }
    if (!req.file) {
      return res.status(400).send('A imagem é obrigatória.');
    }

    const precoFormatado = preco.replace(',', '.'); // Substitui vírgula por ponto
    const parsedPreco = parseFloat(precoFormatado);
    if (isNaN(parsedPreco)) {
      return res.status(400).send('O valor do preço deve ser um número válido.');
    }

    const novaPeca = await Peca.create({
      nome,
      preco: parsedPreco,
      tipo,
      tamanho: tipo === 'Anel' ? tamanho : null, // Salva tamanho apenas se for Anel
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
    const { nome, preco, tipo, status, tamanho } = req.body;
    const precoFormatado = preco.replace(',', '.'); // Substitui vírgula por ponto
    const parsedPreco = parseFloat(precoFormatado);
    if (isNaN(parsedPreco)) {
      return res.status(400).send('O valor do preço deve ser um número válido.');
    }
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
      preco: parsedPreco,
      tipo,
      status,
      tamanho: tipo === 'Anel' ? tamanho : null, // Salva tamanho apenas se for Anel
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

app.post('/admin/pecas/disponibilidade/:id', checkAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const peca = await Peca.findByPk(req.params.id);

    if (!peca) {
      return res.status(404).json({ message: 'Peça não encontrada.' });
    }

    await peca.update({ status: status });

    res.json({ message: 'Disponibilidade atualizada com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar disponibilidade:', error);
    res.status(500).json({ message: 'Erro ao atualizar a disponibilidade.' });
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