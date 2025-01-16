const cds = require('@sap/cds');
const DEBUG = cds.debug('attachments');
const { SELECT, UPSERT, UPDATE } = cds.ql;
const { parse } = require('csv-parse/sync');

let uniqueTableId = 1; // Variável para controlar o ID único incrementado

module.exports = class AttachmentsService extends cds.Service {

  async get(attachments, keys, req = {}) {
    if (attachments.isDraft) {
      attachments = attachments.actives;
    }
    DEBUG?.("Downloading attachment for", attachments.name, keys);
    const result = await SELECT.from(attachments, keys).columns("content");
    return (result && result.content) ? result.content : null;
  }

  async registerUpdateHandlers(srv, entity, attachments) {
    console.log(`Registando handler para entidade: ${entity}`);

    // Processar anexos durante a ativação do draft
    srv.after("SAVE", entity, this.draftSaveHandler(attachments));

    // Processar anexos após a ativação do draft (CREATE)
    srv.after("CREATE", entity, async (req) => {
      console.log(`CREATE trigger chamado para entidade: ${entity}, ID: ${req.data?.ID}`);

      // Selecionar os anexos associados ao documento
      const documentAttachments = await SELECT.from(attachments).where({ up__ID: req.data?.ID });

      console.log(`Anexos encontrados após CREATE: ${documentAttachments.length}`);

      for (const attachment of documentAttachments) {
        console.log('Anexo encontrado:', JSON.stringify(attachment, null, 2));
        if (attachment.filename?.toLowerCase().endsWith('.csv')) {
          if (!attachment.content) {
            console.warn(`O anexo ${attachment.ID} não contém o campo 'content' para processamento.`);
            continue;
          }
          console.log(`Processando CSV para anexo ${attachment.ID}...`);
          await this._processCSV(attachment);
        } else {
          console.log(`O anexo ${attachment.ID} não é um CSV, ignorado.`);
        }
      }
    });
  }

  draftSaveHandler(attachments) {
    return async (_, req) => {
      console.log('draftSaveHandler: Iniciando a execução');

      if (!req || !req.subject || !req.subject.ref || !req.subject.ref[0] || !req.subject.ref[0].where) {
        console.error('draftSaveHandler: Estrutura de req.subject.ref[0].where é inválida ou ausente:', JSON.stringify(req, null, 2));
        return;
      }

      let whereClause = [];
      try {
        whereClause = [
          ...req.subject.ref[0].where.map((x) =>
            x.ref ? { ref: ["up_", ...x.ref] } : x
          ),
          "and",
          { xpr: [{ ref: ["content"] }, "is", "not", "null"] },
        ];
      } catch (err) {
        console.error('Erro ao construir a WHERE clause:', err);
        throw err;
      }

      console.log('draftSaveHandler: WHERE clause construída:', JSON.stringify(whereClause));

      let draftAttachments = [];
      try {
        draftAttachments = await SELECT(["ID", "filename", "content", "up__ID"])
          .from(attachments.drafts)
          .where(whereClause);
      } catch (err) {
        console.error('Erro ao executar a consulta SELECT para drafts:', err);
        throw err;
      }

      console.log('draftSaveHandler: Resultados obtidos:', draftAttachments.length);

      for (const attachment of draftAttachments) {
        console.log('Anexo encontrado:', JSON.stringify(attachment, null, 2));
        if (attachment.filename?.toLowerCase().endsWith('.csv')) {
          console.log(`Processando CSV para anexo ${attachment.ID}...`);
          try {
            await this._processCSV(attachment);
          } catch (err) {
            console.error(`Erro ao processar CSV para o anexo ${attachment.ID}:`, err);
          }
        } else {
          console.log(`O anexo ${attachment.ID} não é um CSV, ignorado.`);
        }
      }

      console.log('draftSaveHandler: Execução concluída.');
    };
  }

  async update(Attachments, key, data) {
    DEBUG?.("Updating attachment for", Attachments.name, key);
    return await UPDATE(Attachments, key).with(data);
  }

  async getStatus(Attachments, key) {
    const result = await SELECT.from(Attachments, key).columns('status');
    return result?.status;
  }

  async deleteInfectedAttachment(Attachments, key) {
    return await UPDATE(Attachments, key).with({ content: null });
  }

  async put(attachments, data, _content) {
    if (!Array.isArray(data)) {
      if (_content) data.content = _content;
      data = [data];
    }

    const results = await Promise.all(
      data.map(async (d) => {
        // Verificar se o registo já existe
        const existing = await cds.run(
          SELECT.one.from(attachments).where({ ID: d.ID })
        );

        if (existing) {
          console.log(`Anexo com ID ${d.ID} já existe.`);
          return existing; // Retorna o registo existente ou trata-o conforme necessário
        }

        const res = await cds.run(INSERT.into(attachments).entries(d));

        // Processar CSV após upload
        if (d.filename?.toLowerCase().endsWith('.csv')) {
          await this._processCSV(d);
        }

        return res;
      })
    );

    return results;
  }

  async _processCSV(attachmentData) {
    if (!attachmentData.content) {
      console.warn('O anexo não contém conteúdo para processamento.');
      return;
    }
  
    try {
      let csvString;
  
      if (typeof attachmentData.content === 'string') {
        csvString = attachmentData.content;
      } else if (Buffer.isBuffer(attachmentData.content)) {
        csvString = attachmentData.content.toString('utf8');
      } else if (attachmentData.content.read) {
        csvString = await this._streamToString(attachmentData.content);
      } else {
        throw new Error('Formato desconhecido para o conteúdo do anexo.');
      }
  
      console.log('Conteúdo convertido do CSV:', csvString);
  
      const records = parse(csvString, { columns: true, skip_empty_lines: true });
      console.log(`Registos encontrados no CSV: ${records.length}`);
  
      if (!records.length) return;
  
      const headers = Object.keys(records[0]);
      console.log('Headers encontrados:', headers);
  
      const tableName = this._generateTableName(attachmentData.filename);
      console.log('Nome da tabela a ser criada:', tableName);
  
      // Chamar a procedure para criar a tabela
      await this._createTable(tableName, headers);
  
      await this._insertDataIntoTable(tableName, headers, records);
  
      console.log(`Tabela "${tableName}" criada e preenchida com sucesso.`);
    } catch (err) {
      console.error('Erro ao processar o CSV:', err);
    }
  }  
  

  async _streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  _generateTableName(filename) {
    return `${filename.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${uniqueTableId++}`;
  }

  async _createTable(tableName, headers) {
    const columnsDefinition = headers.map((h) => `${h} VARCHAR(255)`).join(', ');
  
    console.log(`Chamada à stored procedure para criar a tabela "${tableName}" com as colunas: ${columnsDefinition}`);
  
    try {
      const procedureCall = `CALL HDBC(?, ?)`;
      await cds.db.run(procedureCall, [tableName, columnsDefinition]);
      console.log(`Tabela "${tableName}" criada com sucesso utilizando a stored procedure.`);
    } catch (err) {
      console.error(`Erro ao criar a tabela "${tableName}" utilizando a stored procedure:`, err.message);
      throw new Error(`Não foi possível criar a tabela ${tableName}. Verifica as permissões ou a validade da stored procedure.`);
    }
  }
  

  
  async _insertDataIntoTable(tableName, headers, records) {
  console.log(`Inserindo dados na tabela "${tableName}" com headers:`, headers);
  
  for (const record of records) {
    const columns = headers.join(', ');
    const placeholders = headers.map(() => '?').join(', ');
    const values = headers.map((h) => {
      const value = record[h];
      return value !== undefined ? value : null; // Evitar undefined
    });

    console.log(`SQL INSERT: INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`);
    console.log(`Valores a inserir:`, values);

    try {
      const insertSQL = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;
      await cds.db.run(insertSQL, values);
      console.log(`Dados inseridos com sucesso na tabela "${tableName}"`);
    } catch (err) {
      console.error(`Erro ao inserir dados na tabela "${tableName}":`, err);
    }
  }
}

};
