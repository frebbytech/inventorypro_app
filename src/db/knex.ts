// import knex from "knex";
import 'server-only';

import knex, { Knex } from "knex";
import config from "../../knexfile";


// 1. Augment the global type scope
declare global {
  // eslint-disable-next-line no-var
  var knexInstance: Knex | undefined;
}

// 2. Safely cast the global object
const globalForKnex = globalThis as typeof globalThis & {
  knexInstance?: Knex;
};

// 3. Initialize the database instance
const db: Knex = globalForKnex.knexInstance || knex(config);

// 4. Cache singleton on globalThis across chunks & warm serverless invocations
if (!globalForKnex.knexInstance) {
  globalForKnex.knexInstance = db;
}

export default db;





// // import knex from "knex";
// import config from "../../knexfile";


// import knex from "knex";

// const globalForKnex = global as typeof globalThis & { knex?: ReturnType<typeof knex> };

// const db = globalForKnex.knex || knex(config);

// if (process.env.NODE_ENV !== "production") globalForKnex.knex = db;

// export default db;


// // const db = knex(config);

// // export default db;

// // @/db/knex.js