/*globals require */
"use strict";

/**
 * @property defer
 * @type {function}
 */
const defer     = require("JQDeferred");
const _         = require('lodash');
const isolationLevels=['READ_UNCOMMITTED','READ_COMMITTED','REPEATABLE_READ','SNAPSHOT','SERIALIZABLE'];


module.exports = {
	isolationLevels: isolationLevels,
	objectify: simpleObjectify,
	EdgeConnection: EdgeConnection
};

/**
 * simplified objectifier having an array of column names for first argument
 * @private
 * @param {Array} colNames
 * @param {Array} rows
 * @returns {Array}
 */
function simpleObjectify(colNames, rows) {
	var colLength = colNames.length,
		rowLength = rows.length,
		result = [],
		rowIndex = rowLength,
		colIndex,
		value,
		row;
	while (--rowIndex >= 0) {
		value = {};
		row = rows[rowIndex];
		colIndex = colLength;
		while (--colIndex >= 0) {
			value[colNames[colIndex]] = row[colIndex];
		}
		result[rowIndex] = value;
	}
	return result;
}

/**
 * Gets a  database connection
 * @param {string} connectionString
 * @param {string} driver  can be sqlServer or mySql
 * @constructor
 */
function EdgeConnection(connectionString, driver) {	
	this.sqlCompiler = 'db';
	this.edgeHandler = null;
	this.driver = driver||'mySql';
	this.connectionString = connectionString;

	/*references:["MySqlData.dll",
					"System.Data.SqlClient.dll",
					"Microsoft.Extension.Configuration.dll",
					"System.Configuration.ConfigurationManager.dll"],*/
	//assemblyFile:"edge-db-fake.dll",
	//this.typeName="EdgeCompiler2";		//Startup
	//this.methodName="CompileFunc2";	//Invoke

}



/**
 * transforms row data into plain objects
 * @method simpleObjectifier
 * @private
 * @param {string[]} colNames
 * @param {object[]}  row
 * @returns {object}
 */
function simpleObjectifier(colNames, row) {
	let obj = {};
	_.each(colNames, function (value, index) {
		obj[value] = row[index];
	});
	return obj;
}



/**
 * @private
 * Evaluates parameter to connect to database depending on the open/closed state of the connection.
 * If a connection is open, the handle of the open connection is used. Otherwise, a connectionString is provided.
 * @returns {*}
 */
EdgeConnection.prototype.getDbConn = function () {
	if (this.edgeHandler !== null) {
		return {handler: this.edgeHandler, driver: this.driver};
	}
	return {connectionString: this.connectionString, driver: this.driver};
};


/**
 * Opens the physical connection
 * @public
 * @methodo open
 * @returns {promise}  Returns a promise that is resolved when connection is established
 */
EdgeConnection.prototype.open = function () {
	const def = defer(),
		that = this,
		edge      = require('edge-js'),
		/**
		 * Opens the phisical connection
		 * @method edgeOpenInternal
		 * @private
		 * @returns {promise}
		 */
		edgeOpenInternal = edge.func(this.sqlCompiler,
			{
				source: 'open',
				connectionString: this.connectionString,
				cmd: 'open',
				driver: this.driver,
				/*references:["MySqlData.dll",
					"System.Data.SqlClient.dll",
					"Microsoft.Extension.Configuration.dll",
					"System.Configuration.ConfigurationManager.dll"],*/
				//assemblyFile:"edge-db-fake.dll",
				//typeName:"EdgeCompiler",		//Startup
				//methodName:"CompileFunc"	//Invoke
			});
	edgeOpenInternal({}, function (error, result) {
		if (error) {
			def.reject(error);
			return;
		}
		if (result) {
			that.edgeHandler = result;
			def.resolve();
			return;
		}
		def.reject("shouldn't reach here");
	});
	return def.promise();
};

/**
 * Closes the phisical connection
 * @method edgeClose
 * @returns {*}
 */
EdgeConnection.prototype.close = function () {
	let def = defer(),
		that = this,
		edge      = require('edge-js');

	if (this.edgeHandler===null) {
		def.resolve();
		return def;
	}

	let	edgeClose = edge.func(this.sqlCompiler,
			{
				handler: this.edgeHandler,
				source: 'close',
				cmd: 'close',
				driver: this.driver
			});
	
	edgeClose({}, function (error) {
		if (error) {
			def.reject(error);
			return;
		}
		that.edgeHandler = null;
		def.resolve();
	});
	return def.promise();
};

/**
 * Executes a sql command and returns all sets of results. Each Results is given via a notify or resolve
 * @method queryBatch
 * @param {string} query
 * @param {boolean} [raw] if true, data are left in raw state and will be objectified by the client
 * @returns {defer}  a sequence of {[array of plain objects]} or {meta:[column names],rows:[arrays of raw data]}
 */
EdgeConnection.prototype.queryBatch = function (query, raw) {
	var edge      = require('edge-js'),
		edgeQuery = edge.func(this.sqlCompiler, _.assign({source: query}, this.getDbConn())),
		def = defer();
	//nextTick is necessary in order to run the sql function asyncronously, otherwise, cause of edge-js
	//  and mysql blocking nature, it starts notifying tables before the promise is actually returned
	//   causing data to be loss


	process.nextTick(function () {
		edgeQuery({}, function (error, result) {
			//console.log("receiving result");
			//console.log(result);
			if (error) {
				def.reject(error + ' running ' + query);
				return def.promise();
			}
			let i;
			for (i = 0; i < result.length - 1; i++) {
				if (raw) {
					def.notify(result[i]);
				}
				else {
					def.notify(simpleObjectify(result[i].meta, result[i].rows));
				}
			}
			if (raw) {
				def.resolve(result[i]);
			}
			else {
				def.resolve(simpleObjectify(result[i].meta, result[i].rows));
			}
		});
	});

	return def.promise();
};



/**
 * Executes a series of sql update/insert/delete commands
 * @method updateBatch
 * @param {string} query
 * @returns {*}
 */
EdgeConnection.prototype.updateBatch = function (query) {
	let  edge      = require('edge-js'),
		edgeQuery = edge.func(this.sqlCompiler, _.assign({source: query, cmd: 'nonquery'},
		this.getDbConn())),
		def = defer();
	edgeQuery({}, function (error, result) {
		if (error) {
			def.reject(error);
			return;
		}
		def.resolve(result);
	});
	return def.promise();
};




/**
 * Gets a table and returns each SINGLE row by notification. Could eventually return more than a table indeed
 * For each table read emits a {meta:[column descriptors]} notification, and for each row of data emits a
 *   if raw= false: {row:object read from db}
 *   if raw= true: {row: [array of values read from db]}

 * @method queryLines
 * @param {string} query
 * @param {boolean} [raw=false]
 * @returns {*}
 */
EdgeConnection.prototype.queryLines = function (query, raw) {
	let def = defer(),
		lastMeta,
		callback = function (data) {
			if (data.resolve) {
				def.resolve();
				return {};
			}
			if (data.rows) {
				if (raw) {
					def.notify({row: data.rows[0]});
				} else {
					def.notify({row: simpleObjectifier(lastMeta, data.rows[0])});
				}
			} else {
				lastMeta = data.meta;
				def.notify(data);
			}
			return {};
		},
		edge      = require('edge-js'),
		edgeQuery = edge.func(this.sqlCompiler,
			_.assign({source: query, callback: callback, packetSize: 1},
				this.getDbConn()));
	process.nextTick(function() {
		edgeQuery({}, function (error, result) {
			if (error) {
				def.reject(error + ' running ' + query);
				return;
			}
			if (result.length === 0) {
				//def.resolve();
				return {};
			}
			return {};
		});
	});
	return def.promise();
};



/**
 * the "edgeQuery" function is written in c#, and executes a series of select.
 * If a callback is specified, data is returned separately as {meta} - {rows} - {meta} - {rows} .. notifications
 * in this case has sense the parameter packetSize to limit the number of rows returned in each {rows} packet
 * If a callback is not specified, data is returned as a series of {meta, rows} notifications
 * A field "set" is also attached to any packet in order to identify the result set
 * if raw==false and a table (array of plain objects) is returned, the "set" field is attached to that array
 */


/**
 * Gets data packets row at a time
 * @public
 * @method queryPackets
 * @param {string} query
 * @param {boolean} [raw=false]
 * @param {number} [packSize=0]
 * @returns {*}
 */
EdgeConnection.prototype.queryPackets = function (query, raw, packSize) {
	let def = defer(),
		packetSize = packSize || 0,
		lastMeta,
		currentSet = -1,
		callback = function (data) {
			if (data.resolve) {
				def.resolve();
				return {};
			}
			if (data.meta) {
				currentSet += 1;
			}
			data.set = currentSet;
			if (raw) {
				def.notify(data);
			} else {
				if (data.meta) {
					lastMeta = data.meta;
				} else {
					def.notify({rows: simpleObjectify(lastMeta, data.rows), set: currentSet});
				}
			}
			return {};
		};
	let that = this;
	//nextTick is necessary in order to run the sql function asyncronously, otherwise, cause of edge-js
	//  and mysql blocking nature, it starts notifying tables before the promise is actually returned
	//   causing data to be loss
	process.nextTick(function () {
		let edge      = require('edge-js'),
			edgeQuery = edge.func(that.sqlCompiler, _.assign({source: query, callback: callback, packetSize: packetSize},
			that.getDbConn()));

		edgeQuery({}, function (error) {
			if (error) {
				def.reject(error + ' running ' + query);
				return def.promise();
			}
			//def.resolve();
		});
	});
	return def.promise();
};



/**
 * Runs a sql script, eventually composed of multiple blocks separed by GO lines
 * @public
 * @method run
 * @param {string} script
 * @returns {*}
 */
EdgeConnection.prototype.run = function (script) {
	let os = require('os'),
		//noinspection JSUnresolvedVariable
		lines = script.split(os.EOL),
		blocks = [],
		curr = '',
		first = true,
		that = this,
		i,
		s;
	for (i = 0; i < lines.length; i++) {
		s = lines[i];
		if (s.trim().toUpperCase() === 'GO') {
			blocks.push(curr);
			curr = '';
			first = true;
			continue;
		}
		if (!first) {
			//noinspection JSUnresolvedVariable
			curr += os.EOL;
		}
		curr += s;
		first = false;
	}
	if (curr.trim() !== '') {
		blocks.push(curr);
	}


	let def = defer(),
		index = 0;


	function loopScript() {
		if (index === blocks.length) {
			def.resolve();
		} else {
			that.updateBatch(blocks[index])
			.done(function () {
				index += 1;
				loopScript();
			})
			.fail(function (err) {
				def.reject(err);
			});
		}
	}


	loopScript();

	return def.promise();
};

