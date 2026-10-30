// How backup files are written: one document per line, in MongoDB "Extended JSON" so ids, dates and numbers
// come back exactly as they were. Uses the BSON library that already ships inside mongoose (nothing extra to install).
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;

export const toLine = (doc) => EJSON.stringify(doc, { relaxed: false });
export const fromLine = (line) => EJSON.parse(line, { relaxed: false });
