/**
 * @module 'winston-sql-transport'
 * @fileoverview Winston universal SQL transport for logging
 * @license MIT
 * @author Andrei Tretyakov <andrei.tretyakov@gmail.com>
 */

//const circularJSON = require('circular-json');// changed
const knex = require('knex');
const moment = require('moment');
const { Stream } = require('stream');
const winston  = require('winston'); // changed
//const Transport  = require('winston-transport'); // changed

module.exports = class SQLTransport extends winston.Transport  {
  /**
   * Constructor for the universal transport object.
   * @constructor
   * @param {Object} options
   //* @param {string} options.client - Database client                                  //deleted
   * @param {object} options.knexClient options  - Database connection settings		   // Changed
   * @param {string} [options.label] - Label stored with entry object if defined.
   * @param {string} [options.level=info] - Level of messages that this transport
   * should log.
   * @param {string} [options.timeFormat] - Timeformat for moment() to convert from string 
   * @param {string} [options.name] - Transport instance identifier. Useful if you
   * need to create multiple universal transports.
   * @param {boolean} [options.silent=false] - Boolean flag indicating whether to
   * suppress output.
   * @param {string} [options.tableName=winston_logs] - The name of the table you
   * want to store log messages in.
   */
  constructor(options = {}) {
    super();
    this.name = 'SQLTransport';

    //
    // Configure your storage backing as you see fit
    //
	
	/* changed to below
    if (!options.client) {
      throw new Error('You have to define client');
    }

    const connection = options.connection || {};

    this.client = knex({
      client: options.client,
      connection,
    });
	*/
	
    if (!options.knexClient) {
      throw new Error('You have to define the knex client');
    }

    const knexClient = options.knexClient || {};
    this.client = knex(options.knexClient);

    this.label = options.label || '';

    //
    // Set the level from your options
    //
    this.level = options.level || 'info';

    this.silent = options.silent || false;

    this.tableName = options.tableName || 'winston_logs';
  
    this.timeFormat = options.timeFormat || 'YYYY-MM-DD HH:mm:ss';// added
	this.init(); // added
  }

  /**
   * Create logs table.
   * @return {Promise} result of creation within a Promise
   */
  init() {
    const { client, tableName } = this;
	// change
	return client.schema.hasTable(tableName, (exists) => {
		if (!exists) {
						client.schema.createTable('users', (table) => {
      table.increments();
	  table.timestamp('timestamp').defaultTo(client.fn.now()); 
      table.string('level');
	  table.string('label');    // added
      table.string('message');
	  table.json('meta');      //changed
						});
					  }
	});
	// end of change
  }

  /**
   * Core logging method exposed to Winston. Metadata is optional.
   * @param {string} level - Level at which to log the message.
   * @param {string} message - Message to log
   * @param {Object} meta - Metadata to log
   * @param {Function} callback - Continuation to respond to when complete.
   */
  //change
log(info, callback) {
	// added
	setImmediate(() => {
		this.emit('logged', info);
    });

    const level = info.level || this.level;
	const label = info.label || this.label;
    const message = info.message || '';
	const timestamp = info.timestamp ? moment(info.timestamp,this.timeFormat) : moment() ;
    //let callback = args.shift();

	/*
    if (typeof meta === 'function') {
      callback = meta;
      meta = {};
    }
	*/
// end of change / added	

    const { client, tableName } = this;
    client
      .insert({
        timestamp: timestamp.utc().toDate(), // changed
        level,
		label,
        message,
        meta: JSON.stringify(info) // changed from circularJSON.stringify(meta)
      }).into(tableName)
	  .catch(err => callback(err))
      .then(() => callback(null, true));
  }

  /**
   * Query the transport. Options object is optional.
   * @param {Object} options - Loggly-like query options for this instance.
   * @param {string} [options.from] - Start time for the search.
   * @param {string} [options.until=now] - End time for the search. Defaults to "now".
   * @param {string} [options.rows=100] - Limited number of rows returned by search. Defaults to 100.
   * @param {string} [options.order=desc] - Direction of results returned, either "asc" or "desc".
   * @param {string} [options.fields]
   * @param {Function} callback - Continuation to respond to when complete.
   */
  query(...args) {
    let options = args.shift() || {};
    let callback = args.shift();

    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options.fields = options.fields || [];

    let query = this.client
      .select(options.fields)
      .from(this.tableName);

    if (options.from && options.until) {
      query = query.whereBetween('timestamp', [
        moment(options.from).utc().toDate(),
        moment(options.until).utc().toDate()
      ]);
    }

    if (options.rows) {
      query = query.limit(options.rows);
    }

    if (options.order) {
      query = query.orderBy('timestamp', options.order);
    }

    query
      .then((data) => {
        callback(null, data);
      })
      .catch(callback);
  }

  /**
   * Returns a log stream for this transport. Options object is optional.
   * @param {Object} options - Stream options for this instance.
   * @param {Stream} stream - Pass in a pre-existing stream.
   * @return {Stream}
   */
  stream(...args) {
    const options = args.shift() || {};
    const stream = args.shift() || new Stream();

    const self = this;

    let start = (typeof options.start === 'undefined') ? null : options.start;
    let row = 0;

    if (start === -1) {
      start = null;
    }

    stream.destroy = function destroy() {
      this.destroyed = true;
    };

    function poll() {
      self.client
        .select()
        .from(self.tableName)
        .then((results) => {
          if (stream.destroyed) {
            return null;
          }

          results.forEach((log) => {
            if (start === null || row > start) {
              stream.emit('log', log);
            }
            row += 1;
          });

          return setTimeout(poll, 2000);
        })
        .catch((error) => {
          if (stream.destroyed) {
            return;
          }
          stream.emit('error', error);
          setTimeout(poll, 2000);
        });
    }

    // we need to poll here.
    poll(start);

    return stream;
  }
  
 //added
 close() {
	  const self = this;
	  self.client.destroy()
		.catch((err) => { throw new Error ("Winston SQL Transport " + err)});
  }

}

//changed
//module.exports = { SQLTransport };
