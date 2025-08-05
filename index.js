require('dotenv').config({ debug: true });
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const session = require('express-session');
const multer = 'multer';
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Op } = require('sequelize');

const sequelize = require('./config/database');
const Peca = require('./models/Peca');

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Carregar credenciais do admin (hash da senha)
let adminCredentials = {};
const adminCredentialsPath = 'data/admin_credentials.json';

async function loadAdminCredentials() {
  try {
    const data = await fs.promises.readFile(adminCredentialsPath, 'utf8');
    adminCredentials = JSON.parse(data);
  } catch (error) {
    console.log('Criando hash da senha do admin...');
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, saltRounds);
    adminCredentials = {
      username: process.env.ADMIN_USERNAME,
      passwordHash: hashedPassword
    };
    await fs.promises.writeFile(adminCredentialsPath, JSON.stringify(adminCredentials, null, 2));
    console.log('Hash da senha do admin criado e salvo.');
  }
}

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(session({
  secret: 'mysecret',
  resave: false,
  saveUninitialized: true
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Rota Principal
app.get('/', async (req, res) => {
  try {
    const { tipo } = req.query;
    const where = tipo ? { tipo } : {};
    const pecas = await Peca.findAll({ where });
    res.render('index', { pecas, selectedType: tipo });
  } catch (error) {
    console.error('Erro ao buscar peças:', error);
    res.status(500).send('Erro ao buscar peças.');
  }
});

// Rota Admin
app.get('/admin', async (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect('/admin/login');
  }
  try {
    const { nome } = req.query;
    const where = nome ? { nome: { [Op.like]: `%${nome}%` } } : {};
    const pecas = await Peca.findAll({ where });
    res.render('admin', { pecas, filterName: nome });
  } catch (error) {
    console.error('Erro ao buscar peças para admin:', error);
    res.status(500).send('Erro ao buscar peças.');
  }
});

// Rotas de Login
app.get('/admin/login', (req, res) => {
  res.render('login');
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === adminCredentials.username) {
    const match = await bcrypt.compare(password, adminCredentials.passwordHash);
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

// Configuração do Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'amavi',
    format: async (req, file) => 'png',
    public_id: (req, file) => Date.now() + '-' + file.originalname,
  },
});
const upload = multer({ storage: storage });

// Rotas para Peças (CRUD)
app.get('/admin/pecas/nova', (req, res) => {
  if (req.session.loggedin) {
    res.render('nova-peca');
  } else {
    res.redirect('/admin/login');
  }
});

app.post('/admin/pecas/nova', upload.single('imagem'), async (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/admin/login');
    }

    const { nome, valor, tipo, tamanho } = req.body;
    let errors = [];

    if (!nome || nome.trim() === '') errors.push('O nome da peça é obrigatório.');
    if (isNaN(parseFloat(valor)) || parseFloat(valor) <= 0) errors.push('O valor deve ser um número positivo.');
    if (!req.file) errors.push('A imagem da peça é obrigatória.');
    
    const nomeExistente = await Peca.findOne({ where: { nome } });
    if (nomeExistente) {
        errors.push('Já existe uma peça com este nome.');
    }

    if (errors.length > 0) {
        if (req.file) {
            cloudinary.uploader.destroy(req.file.filename);
        }
        return res.status(400).send(errors.join('<br>'));
    }

    try {
        await Peca.create({
            nome,
            valor: parseFloat(valor),
            tipo,
            tamanho: tipo === 'Anel' ? tamanho : null,
            imagem: req.file.path
        });
        res.redirect('/admin');
    } catch (error) {
        console.error('Erro ao criar nova peça:', error);
        if (req.file) {
            cloudinary.uploader.destroy(req.file.filename);
        }
        res.status(500).send('Erro ao salvar a peça.');
    }
});

app.get('/admin/pecas/editar/:id', async (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/admin/login');
    }
    try {
        const peca = await Peca.findByPk(req.params.id);
        if (peca) {
            res.render('editar-peca', { peca });
        } else {
            res.status(404).send('Peça não encontrada.');
        }
    } catch (error) {
        console.error('Erro ao buscar peça para edição:', error);
        res.status(500).send('Erro ao buscar a peça.');
    }
});

app.post('/admin/pecas/editar/:id', upload.single('imagem'), async (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/admin/login');
    }
    try {
        const { nome, valor, disponibilidade, tipo, tamanho } = req.body;
        const data = { nome, valor: parseFloat(valor), disponibilidade, tipo, tamanho };
        if (req.file) {
            data.imagem = req.file.path;
        }
        await Peca.update(data, { where: { id: req.params.id } });
        res.redirect('/admin');
    } catch (error) {
        console.error('Erro ao editar peça:', error);
        res.status(500).send('Erro ao editar a peça.');
    }
});

app.get('/admin/pecas/excluir/:id', async (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/admin/login');
    }
    try {
        const peca = await Peca.findByPk(req.params.id);
        if (peca && peca.imagem) {
            const publicId = peca.imagem.split('/').pop().split('.')[0];
            cloudinary.uploader.destroy(`amavi/${publicId}`);
        }
        await Peca.destroy({ where: { id: req.params.id } });
        res.redirect('/admin');
    } catch (error) {
        console.error('Erro ao excluir peça:', error);
        res.status(500).send('Erro ao excluir a peça.');
    }
});

app.post('/admin/pecas/disponibilidade/:id', async (req, res) => {
    if (!req.session.loggedin) {
        return res.status(401).json({ message: 'Não autorizado.' });
    }
    try {
        await Peca.update({ disponibilidade: req.body.disponibilidade }, { where: { id: req.params.id } });
        res.json({ message: 'Disponibilidade atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar disponibilidade:', error);
        res.status(500).json({ message: 'Erro ao atualizar a disponibilidade.' });
    }
});

// Inicialização do servidor e conexão com o banco
async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('Conexão com o banco de dados estabelecida com sucesso.');
        await sequelize.sync({ alter: true }); // Isso cria/altera tabelas, mas não deleta dados.
        console.log('Modelos sincronizados com o banco de dados.');
        await loadAdminCredentials();
        app.listen(port, () => {
            console.log(`Servidor rodando na porta ${port}`);
        });
    } catch (error) {
        console.error('Não foi possível conectar ao banco de dados:', error);
        process.exit(1);
    }
}

startServer();