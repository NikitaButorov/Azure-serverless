const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Привет из бессерверного приложения Azure Container Apps!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    service: 'Azure Container Apps Demo',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    podName: process.env.HOSTNAME || 'local'
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
}); 