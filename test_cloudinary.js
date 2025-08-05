require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

cloudinary.uploader.upload("https://res.cloudinary.com/demo/image/upload/sample.jpg", { folder: "test-folder-from-cli" })
  .then(result => {
    console.log("Upload bem-sucedido:", result.secure_url);
  })
  .catch(error => {
    console.error("Erro no upload:", error);
  });