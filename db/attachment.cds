using {my.document as my} from './irc';
using {Attachments} from '@cap-js/attachments';

extend my.Document with {
    attachments : Composition of many Attachments;
}