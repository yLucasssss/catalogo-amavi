require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer');
const cloudinary = require('cloudinary').v2; // Import cloudinary
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // Import CloudinaryStorage

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10; // Custo do hashing, quanto maior, mais seguro (e mais lento)

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Carregar credenciais do admin (hash da senha)
let adminCredentials = {};
const adminCredentialsPath = 'data/admin_credentials.json';

// Função para carregar ou criar o hash da senha
async function loadAdminCredentials() {
  try {
    const data = await fs.promises.readFile(adminCredentialsPath, 'utf8');
    adminCredentials = JSON.parse(data);
  } catch (error) {
    // Se o arquivo não existe ou há erro, cria um novo hash
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

loadAdminCredentials(); // Carrega as credenciais ao iniciar o app

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(session({
  secret: 'mysecret',
  resave: false,
  saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Adicionado para parsear JSON no corpo da requisição

app.get('/', (req, res) => {
  fs.readFile('data/pecas.json', 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send('Erro ao ler o arquivo de dados.');
      return;
    }
    let pecas = JSON.parse(data);
    const selectedType = req.query.tipo;

    if (selectedType) {
      pecas = pecas.filter(peca => peca.tipo === selectedType);
    }

    res.render('index', { pecas: pecas, selectedType: selectedType });
  });
});

app.get('/admin', (req, res) => {
  if (req.session.loggedin) {
    fs.readFile('data/pecas.json', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send('Erro ao ler o arquivo de dados.');
        return;
      }
      let pecas = JSON.parse(data);
      const filterName = req.query.nome;

      if (filterName) {
        pecas = pecas.filter(peca => peca.nome.toLowerCase().includes(filterName.toLowerCase()));
      }

      res.render('admin', { pecas: pecas, filterName: filterName });
    });
  } else {
    res.redirect('/admin/login');
  }
});

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

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'catalogo-amavi', // Folder in Cloudinary to store images
    format: async (req, file) => 'png', // supports promises as well
    public_id: (req, file) => Date.now() + '-' + file.originalname,
  },
});

const upload = multer({ storage: storage });

app.get('/admin/pecas/nova', (req, res) => {
  if (req.session.loggedin) {
    res.render('nova-peca');
  } else {
    res.redirect('/admin/login');
  }
});

app.post('/admin/pecas/nova', upload.single('imagem'), (req, res) => {
  if (req.session.loggedin) {
    fs.readFile('data/pecas.json', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send('Erro ao ler o arquivo de dados.');
        return;
      }
      const pecas = JSON.parse(data);
      const novaPeca = {
        id: pecas.length > 0 ? pecas[pecas.length - 1].id + 1 : 1,
        nome: req.body.nome,
        valor: parseFloat(req.body.valor),
        disponibilidade: 'disponível',
        tipo: req.body.tipo,
        tamanho: req.body.tamanho,
        imagem: req.file.path // Use req.file.path for Cloudinary URL
      };
      pecas.push(novaPeca);
      fs.writeFile('data/pecas.json', JSON.stringify(pecas, null, 2), (err) => {
        if (err) {
          console.error(err);
          res.status(500).send('Erro ao salvar o arquivo de dados.');
          return;
        }
        res.redirect('/admin');
      });
    });
  } else {
    res.redirect('/admin/login');
  }
});

app.get('/admin/pecas/editar/:id', (req, res) => {
  if (req.session.loggedin) {
    fs.readFile('data/pecas.json', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send('Erro ao ler o arquivo de dados.');
        return;
      }
      const pecas = JSON.parse(data);
      const peca = pecas.find(p => p.id === parseInt(req.params.id));
      if (peca) {
        res.render('editar-peca', { peca: peca });
      } else {
        res.status(404).send('Peça não encontrada.');
      }
    });
  } else {
    res.redirect('/admin/login');
  }
});

app.post('/admin/pecas/editar/:id', upload.single('imagem'), (req, res) => {
  if (req.session.loggedin) {
    fs.readFile('data/pecas.json', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send('Erro ao ler o arquivo de dados.');
        return;
      }
      let pecas = JSON.parse(data);
      const pecaIndex = pecas.findIndex(p => p.id === parseInt(req.params.id));
      if (pecaIndex !== -1) {
        pecas[pecaIndex].nome = req.body.nome;
        pecas[pecaIndex].valor = parseFloat(req.body.valor);
        pecas[pecaIndex].disponibilidade = req.body.disponibilidade;
        pecas[pecaIndex].tipo = req.body.tipo;
        pecas[pecaIndex].tamanho = req.body.tamanho;
        if (req.file) {
          pecas[pecaIndex].imagem = req.file.path; // Use req.file.path for Cloudinary URL
        }
        fs.writeFile('data/pecas.json', JSON.stringify(pecas, null, 2), (err) => {
          if (err) {
            console.error(err);
            res.status(500).send('Erro ao salvar o arquivo de dados.');
            return;
          }
          res.redirect('/admin');
        });
      } else {
        res.status(404).send('Peça não encontrada.');
      }
    });
  } else {
    res.redirect('/admin/login');
  }
});

app.get('/admin/pecas/excluir/:id', (req, res) => {
  if (req.session.loggedin) {
    fs.readFile('data/pecas.json', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send('Erro ao ler o arquivo de dados.');
        return;
      }
      let pecas = JSON.parse(data);
      pecas = pecas.filter(p => p.id !== parseInt(req.params.id));
      fs.writeFile('data/pecas.json', JSON.stringify(pecas, null, 2), (err) => {
        if (err) {
          console.error(err);
          res.status(500).send('Erro ao salvar o arquivo de dados.');
          return;
        }
        res.redirect('/admin');
      });
    });
  } else {
    res.redirect('/admin/login');
  }
});

app.post('/admin/pecas/disponibilidade/:id', (req, res) => {
  if (req.session.loggedin) {
    fs.readFile('data/pecas.json', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao ler o arquivo de dados.' });
        return;
      }
      let pecas = JSON.parse(data);
      const pecaIndex = pecas.findIndex(p => p.id === parseInt(req.params.id));
      if (pecaIndex !== -1) {
        pecas[pecaIndex].disponibilidade = req.body.disponibilidade;
        fs.writeFile('data/pecas.json', JSON.stringify(pecas, null, 2), (err) => {
          if (err) {
            console.error(err);
            res.status(500).json({ message: 'Erro ao salvar o arquivo de dados.' });
            return;
          }
          res.json({ message: 'Disponibilidade atualizada com sucesso.' });
        });
      } else {
        res.status(404).json({ message: 'Peça não encontrada.' });
      }
    });
  } else {
    res.status(401).json({ message: 'Não autorizado.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});