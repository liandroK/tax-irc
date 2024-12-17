const cds = require('@sap/cds');
const csvParser = require('csv-parser'); // Instalar esta biblioteca
const fs = require('fs');
const path = require('path');

module.exports = cds.service.impl(async function () {
    const { Attachments } = this.entities;

    this.on('uploadAttachment', async (req) => {
      console.log('Função chamada!'); // Para debug
        const { filename, mimeType, content } = req.data;

        // Guarda o ficheiro na tabela Attachments
        const newAttachment = await INSERT.into(Attachments).entries({
            ID: cds.utils.uuid(),
            filename,
            mimeType,
            content,
            createdAt: new Date(),
            createdBy: req.user.id,
        });

        // Verifica se é um ficheiro CSV
        if (mimeType === 'text/csv') {
            const filePath = path.join(__dirname, 'uploads', filename);
            fs.writeFileSync(filePath, content);

            // Lê o conteúdo do CSV
            const headers = [];
            const rows = [];
            fs.createReadStream(filePath)
                .pipe(csvParser())
                .on('headers', (headerRow) => headers.push(...headerRow))
                .on('data', (dataRow) => rows.push(dataRow))
                .on('end', async () => {
                    // Cria a tabela dinamicamente
                    const tableName = `DYNAMIC_${filename.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const columns = headers.map((header) => `${header} NVARCHAR(255)`).join(', ');

                    const createTableSQL = `
                        CREATE TABLE ${tableName} (${columns});
                    `;
                    await cds.run(createTableSQL);

                    // Insere os dados na tabela
                    for (const row of rows) {
                        const insertSQL = `
                            INSERT INTO ${tableName} (${headers.join(', ')})
                            VALUES (${headers.map((header) => `'${row[header]}'`).join(', ')});
                        `;
                        await cds.run(insertSQL);
                    }

                    console.log(`Tabela ${tableName} criada com sucesso!`);
                });
        }

        return newAttachment;
    });
});

cds.on('uploadAttachment', async (req) => {
  console.log('Função uploadAttachment chamada!');
  return 'Ação chamada globalmente!';
});
