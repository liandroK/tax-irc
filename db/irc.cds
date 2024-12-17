context my.document {

  entity Company {
      key ID       : UUID;               // Chave primária para Company
      name         : String;             // Nome da empresa
      nif          : String(9);          // NIF da empresa
      status       : Boolean default true; // Estado ativo/inativo
      documents    : Association to many Document on documents.companyID = ID;
  }

  entity Document {
      key ID       : Integer;            // Chave primária para Document
      title        : String;             // Título do documento
      version      : Integer;            // Versão do documento
      companyID    : UUID;               // Chave estrangeira para Company
      year : Integer;
      month: Integer;
  }

}
