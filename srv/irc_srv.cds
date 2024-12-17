using my.document as my from '../db/irc';

service DocumentService {
    @odata.draft.enabled: true
    entity Document as projection on my.Document {
        ID, title, version, attachments
    };

}