const cds = require('@sap/cds');

cds.on('bootstrap', (app) => {
    console.log('Servidor CAP iniciado!');
});

module.exports = cds.server; // Exporta o servidor corretamente
