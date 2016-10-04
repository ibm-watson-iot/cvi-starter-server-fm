/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 *
 * Data Privacy Disclaimer
 * 
 * This Program has been developed for demonstration purposes only to illustrate the technical
 * capabilities and potential business uses of the IBM IoT for Automotive
 * 
 * The components included in this Program may involve the processing of personal information
 * (for example location tracking and behavior analytics). When implemented in practice such
 * processing may be subject to specific legal and regulatory requirements imposed by country
 * specific data protection and privacy laws. Any such requirements are not addressed in
 * this Program.
 * 
 * Licensee is responsible for the ensuring Licensee's use of this Program and any deployed
 * solution meets applicable legal and regulatory requirements. This may require the implementation
 * of additional features and functions not included in the Program.
 * 
 * Apple License issue
 * 
 * This Program is intended solely for use with an Apple iOS product and intended to be used
 * in conjunction with officially licensed Apple development tools and further customized
 * and distributed under the terms and conditions of Licensee's licensed Apple iOS Developer
 * Program or Licensee's licensed Apple iOS Enterprise Program.
 * 
 * Licensee agrees to use the Program to customize and build the application for Licensee's own
 * purpose and distribute in accordance with the terms of Licensee's Apple developer program
 * 
 * Risk Mitigation / Product Liability Issues
 * 
 * The Program and any resulting application is not intended for design, construction, control,
 * or maintenance of automotive control systems where failure of such sample code or resulting
 * application could give rise to a material threat of death or serious personal injury.
 * 
 * IBM shall have no responsibility regarding the Program's or resulting application's compliance
 * with laws and regulations applicable to Licensee's business and content. Licensee is responsible
 * for use of the Program and any resulting application.
 * 
 * As with any development process, Licensee is responsible for developing, sufficiently testing
 * and remediating Licensee's products and applications and Licensee is solely responsible for any
 * foreseen or unforeseen consequences or failures of Licensee's products or applications.
 * 
 * REDISTRIBUTABLES
 * 
 * If the Program includes components that are Redistributable, they will be identified 
 * in the REDIST file that accompanies the Program. In addition to the license rights granted
 * in the Agreement, Licensee may distribute the Redistributables subject to the following terms:
 * 
 * 1) Redistribution must be in source code form only and must conform to all directions,
 *    instruction and specifications in the Program's accompanying REDIST or documentation;
 * 2) If the Program's accompanying documentation expressly allows Licensee to modify
 *    the Redistributables, such modification must conform to all directions, instruction and
 *    specifications in that documentation and these modifications, if any, must be treated
 *    as Redistributables;
 * 3) Redistributables may be distributed only as part of Licensee's application that was developed
 *    using the Program ("Licensee's Application") and only to support Licensee's customers
 *    in connection with their use of Licensee's Application. Licensee's application must constitute
 *    significant value add such that the Redistributables are not a substantial motivation
 *    for the acquisition by end users of Licensee's software product;
 * 4) If the Redistributables include a Java Runtime Environment, Licensee must also include other
 *    non-Java Redistributables with Licensee's Application, unless the Application is designed to
 *    run only on general computer devices (e.g., laptops, desktops and servers) and not on handheld
 *    or other pervasive devices (i.e., devices that contain a microprocessor but do not have
 *    computing as their primary purpose);
 * 5) Licensee may not remove any copyright or notice files contained in the Redistributables;
 * 6) Licensee must hold IBM, its suppliers or distributors harmless from and against any claim
 *    arising out of the use or distribution of Licensee's Application;
 * 7) Licensee may not use the same path name as the original Redistributable files/modules;
 * 8) Licensee may not use IBM's, its suppliers or distributors names or trademarks in connection
 *    with the marketing of Licensee's Application without IBM's or that supplier's
 *    or distributor's prior written consent;
 * 9) IBM, its suppliers and distributors provide the Redistributables and related documentation
 *    without obligation of support and "AS IS", WITH NO WARRANTY OF ANY KIND, EITHER EXPRESS
 *    OR IMPLIED, INCLUDING THE WARRANTY OF TITLE, NON-INFRINGEMENT OR NON-INTERFERENCE AND THE
 *    IMPLIED WARRANTIES AND CONDITIONS OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.;
 * 10) Licensee is responsible for all technical assistance for Licensee's Application and any
 *     modifications to the Redistributables; and
 * 11) Licensee's license agreement with the end user of Licensee's Application must notify the end
 *     user that the Redistributables or their modifications may not be i) used for any purpose
 *     other than to enable Licensee's Application, ii) copied (except for backup purposes),
 *     iii) further distributed or transferred without Licensee's Application or 
 *     iv) reverse assembled, reverse compiled, or otherwise translated except as specifically
 *     permitted by law and without the possibility of a contractual waiver. Furthermore, Licensee's
 *     license agreement must be at least as protective of IBM as the terms of this Agreement.
 * 
 * Feedback License
 * 
 * In the event Licensee provides feedback to IBM regarding the Program, Licensee agrees to assign
 * to IBM all right, title, and interest (including ownership of copyright) in any data, suggestions,
 * or written materials that 1) are related to the Program and 2) that Licensee provides to IBM.
 */
var driverInsightsAlert = module.exports = {};

var _ = require("underscore");
var Q = require("q");
var request = require("request");
var cfenv = require("cfenv");
var moment = require("moment");
var dbClient = require('./../cloudantHelper.js');
var driverInsightsAsset = require('./asset.js');
var driverInsightsProbe = require('./probe.js');

var debug = require('debug')('alert');
debug.log = console.log.bind(console);

var FLEETALERT_DB_NAME = "fleet_alert";
var VEHICLE_VENDOR_IBM = "IBM";
var BULK_INSERT_INTERVAL = "1000";

_.extend(driverInsightsAlert, {
	/*
	 * {mo_id: {
	 * 	vehicleInfo: {status: "Active", properties: {fuelTank: 60}},
	 * 	prevProbe: {ts: xxxxxxxxx, ...., props: {fuel: 49.1, engineTemp: 298.2}}
	 * }}
	 */
	_vehicles: {},

	/*
	 * {name: {
	 * 	fireRule: function(probe, vehicle){return newAlerts;},
	 * 	closeRule: function(alert, probe, vehicle){return closedAlert;}
	 * }}
	 */
	alertRules: {},

	/*
	 * {
	 * 	mo_id: {
	 * 		alert_type("half_fuel"): {source: {type: "script", id: "half_fuel"}, type: "half_fuel", description: "xxx", severity: "Critical/High/Medium/Low", mo_id: "xxxx-xxxx-xxx...", ts: xxxx},
	 * 		message_type("message_xxxxx"): {source: {type: "message", id: message_type}, type: message_type, description: "xxx", severity: "Critical/High/Medium/Low", mo_id: "xxxx-xxxx-xxx...", ts: xxxx},
	 * 		event_id("yyyyy"): {source: {type: "event", id: event_id}, type: "023", description: "Major Event", severity: "Low", ...}
	 * 	},
	 * 	mo_id: {...}
	 * }
	 */
	currentAlerts: {},

	/*
	 * Accumulate alerts to insert(create/close) and insert by bulk
	 */
	alertsToInsert: {},
	insertTimeout: null,
	db: null,

	_init: function(){
		var self = this;
		this.db = dbClient.getDB(FLEETALERT_DB_NAME, this._getDesignDoc());
		this.getAlerts([], false, 200); // Get and cache all alerts

		// Low Fuel
		this.registerAlertRule("low_fuel", {
			fireRule: function(probe, vehicle){
				var alerts = [];
				if(vehicle && vehicle.vehicleInfo && vehicle.vehicleInfo.properties && vehicle.vehicleInfo.properties.fuelTank
				&& vehicle.prevProbe && vehicle.prevProbe.props && vehicle.prevProbe.props.fuel
				&& probe && probe.props && probe.props.fuel){
					var fuelTank = vehicle.vehicleInfo.properties.fuelTank;
					var prevFuel = vehicle.prevProbe.props.fuel;
					var fuel = probe.props.fuel;
					if(prevFuel/fuelTank >= 0.1 && fuel/fuelTank < 0.1){
						var alert = {
								source: {type: "script", id: "low_fuel"},
								type: "low_fuel",
								description: "Fuel at 1/10 tank",
								severity: "High",
								mo_id: probe.mo_id,
								ts: probe.ts,
								latitude: probe.matched_latitude || probe.latitude,
								longitude: probe.matched_longitude || probe.longitude,
								simulated: VEHICLE_VENDOR_IBM === vehicle.vehicleInfo.vendor
							};
						alerts.push(alert);
					}
				}
				return alerts;
			},
			closeRule: function(alert, probe, vehicle){
				if(vehicle && vehicle.vehicleInfo && vehicle.vehicleInfo.properties && vehicle.vehicleInfo.properties.fuelTank
				&& probe && probe.props && probe.props.fuel){
					var fuelTank = vehicle.vehicleInfo.properties.fuelTank;
					var fuel = probe.props.fuel;
					if(fuel/fuelTank >= 0.1){
						alert.closed_ts = probe.ts;
						return alert;
					}
				}
			}
		});

		// Half Fuel
		this.registerAlertRule("half_fuel", {
			fireRule: function(probe, vehicle){
				var alerts = [];
				if(vehicle && vehicle.vehicleInfo && vehicle.vehicleInfo.properties && vehicle.vehicleInfo.properties.fuelTank
				&& vehicle.prevProbe && vehicle.prevProbe.props && vehicle.prevProbe.props.fuel
				&& probe && probe.props && probe.props.fuel){
					var fuelTank = vehicle.vehicleInfo.properties.fuelTank;
					var prevFuel = vehicle.prevProbe.props.fuel;
					var fuel = probe.props.fuel;
					var prevFuelRatio = prevFuel/fuelTank;
					var fuelRatio = fuel/fuelTank;
					if((prevFuelRatio < 0.1 || 0.5 <= prevFuelRatio) && (0.1 <= fuelRatio && fuelRatio < 0.5)){
						var alert = {
								source: {type: "script", id: "half_fuel"},
								type: "half_fuel",
								description: "Fuel at half full",
								severity: "Medium",
								mo_id: probe.mo_id,
								ts: probe.ts,
								latitude: probe.matched_latitude || probe.latitude,
								longitude: probe.matched_longitude || probe.longitude,
								simulated: VEHICLE_VENDOR_IBM === vehicle.vehicleInfo.vendor
							};
						alerts.push(alert);
					}
				}
				return alerts;
			},
			closeRule: function(alert, probe, vehicle){
				if(vehicle && vehicle.vehicleInfo && vehicle.vehicleInfo.properties && vehicle.vehicleInfo.properties.fuelTank
				&& vehicle.prevProbe && vehicle.prevProbe.props && vehicle.prevProbe.props.fuel
				&& probe && probe.props && probe.props.fuel){
					var fuelTank = vehicle.vehicleInfo.properties.fuelTank;
					var fuel = probe.props.fuel;
					var fuelRatio = fuel/fuelTank;
					if(fuelRatio < 0.1 || 0.5 < fuelRatio){
						alert.closed_ts = probe.ts;
						return alert;
					}
				}
			}
		});

		// High Engine Temperature
		this.registerAlertRule("high_engine_temp", {
			fireRule: function(probe, vehicle){
				var alerts = [];
				if(vehicle && vehicle.prevProbe && vehicle.prevProbe.props && vehicle.prevProbe.props.engineTemp <= 120
				&& probe && probe.props && probe.props.engineTemp > 120){
					var alert = {
							source: {type: "script", id: "high_engine_temp"},
							type: "high_engine_temp",
							description: "Engine temperature is too high.",
							severity: "High",
							mo_id: probe.mo_id,
							ts: probe.ts,
							latitude: probe.matched_latitude || probe.latitude,
							longitude: probe.matched_longitude || probe.longitude,
							simulated: VEHICLE_VENDOR_IBM === vehicle.vehicleInfo.vendor
						};
					alerts.push(alert);
				}
				return alerts;
			},
			closeRule: function(alert, probe, vehicle){
				if(vehicle && probe && probe.props && probe.props.engineTemp <= 120){
					alert.closed_ts = probe.ts;
					return alert;
				}
			}
		});
	},
	_searchAlertIndex: function(opts){
		return Q(this.db).then(function(db){
			var deferred = Q.defer();
			db.search(FLEETALERT_DB_NAME, 'alerts', opts, function(err, result){
				if (err)
					return deferred.reject(err);
				return deferred.resolve(result);
			});
			return deferred.promise;
		});
	},
	_getDesignDoc: function(){
		var fleetAlertIndexer = function(doc){
			if(doc.ts && doc.mo_id && doc.type && doc.severity){
				index("ts", doc.ts, {store: true});
				index("mo_id", doc.mo_id, {store: true});
				index("type", doc.type, {store: true});
				index("severity", doc.severity, {store: true});
				index("closed_ts", doc.closed_ts||-1, {store: true});
				index("simulated", doc.simulated, {store: true});

				index("description", doc.description||"", {store: true});
				index("latitude", doc.latitude, {store: true});
				index("longitude", doc.longitude, {store: true});
			}
		};
		var designDoc = {
				_id: '_design/' + FLEETALERT_DB_NAME,
				indexes: {
					alerts: {
						analyzer: {name: 'keyword'},
						index: fleetAlertIndexer.toString()
					}
				}
		};
		return designDoc;
	},

	evaluateAlertRule: function(probe){
		var self = this;
		var vehicle = this._vehicles[probe.mo_id];
		var promise;
		Q.when(this._getVehicle(probe.mo_id), function(vehicle){
			self._evaluateAlertRule(probe, _.clone(vehicle));
			vehicle.prevProbe = probe;
		});
	},
	_evaluateAlertRule: function(probe, vehicle){
		var self = this;
		_.values(this.alertRules).forEach(function(rule){
			setImmediate(function(){
				var alerts = rule.fireRule(probe, vehicle);
				alerts.forEach(function(alert){
					self.addAlert(alert);
				});
			});
		});
		var _alerts = _.clone(this.currentAlerts);
		var _alertsForVehicle = _alerts[probe.mo_id] || {};
		Object.keys(_alertsForVehicle).forEach(function(key){
			var alert = _alertsForVehicle[key];
			if(alert && alert.source && alert.source.type === "script"){
				setImmediate(function(){
					var rule = self.alertRules[alert.type];
					if(rule){
						var closedAlert = rule.closeRule(alert, probe, vehicle);
						if(closedAlert){
							self.updateAlert(closedAlert);
						}
					}else{
						alert.closed_ts = probe.ts;
						self.updateAlert(alert);
					}
				});
			}
		});
	},
	_getVehicle: function(mo_id){
		var self = this;
		var deferred = Q.defer();
		var vehicle = this._vehicles[mo_id];
		if(vehicle){
			deferred.resolve(vehicle);
		}else{
			Q.when(driverInsightsAsset.getVehicle(mo_id), function(vehicleInfo){
				self._vehicles[mo_id] = vehicle = {
					vehicleInfo: vehicleInfo
				};
				deferred.resolve(vehicle);
			}, function(error){
				console.error(error);
				deferred.reject(error);
			});
		}
		return deferred.promise;
	},

	handleEvents: function(mo_id, events){
		this.closeAlertFromEvents(mo_id, events);
		this.addAlertFromEvents(mo_id, events);
	},
	addAlertFromEvents: function(mo_id, events){
		var self = this;
		var ts = moment().valueOf();
		(events||[]).forEach(function(event){
			if(!self.currentAlerts[mo_id]){
				self.currentAlerts[mo_id] = {};
			}
			var props = event.props || {}; // A message should have props
			var source_id = String(event.event_id || props.source_id);
			var source_type = "";
			if(event.event_id){
				source_type = "event";
			}else if(props.message_type){
				source_type = "message";
			}
			if(!source_id){
				return;
			}
			var alert = self.currentAlerts[mo_id][source_id];
			if(alert){
				// Do nothing during same id/type of events/messages are coming consecutively
			}else{
				Q.when(self._getVehicle(mo_id), function(vehicle){
					alert = {
							source: {type: source_type, id: source_id},
							type: event.event_type || props.message_type,
							description: event.event_name || event.message,
							severity: props.severity || "Info",
							mo_id: mo_id,
							ts: ts,
							latitude: event.s_latitude || event.latitude || props.latitude,
							longitude: event.s_longitude || event.longitude || props.longitude,
							simulated: VEHICLE_VENDOR_IBM === vehicle.vehicleInfo.vendor
						};
					self.addAlert(alert);
				});
			}
		});
	},
	closeAlertFromEvents: function(mo_id, events){
		var self = this;
		var closed_ts = moment().valueOf();
		var _alerts = _.clone(this.currentAlerts || {});
		var _alertsForVehicle = _alerts[mo_id] || {};
		Object.keys(_alertsForVehicle).forEach(function(key){
			var source_type = _alertsForVehicle[key].source && _alertsForVehicle[key].source.type;
			if(source_type === "script"){
				return;
			}
			if((events || []).every(function(event){
				// No related event/message is included in events
				var props = event.props || {}; // A message should have props
				var source_id = event.event_id || props.source_id;
				return !source_id || key !== String(source_id);
			})){
				var alert = _alertsForVehicle[key];
				alert.closed_ts = closed_ts;
				self.updateAlert(alert);
			}
		});
	},

	getAlertsForVehicleInArea: function(conditions, area, includeClosed, limit){
		if(!area){
			return Q.reject();
		}
		var deferred = Q.defer();
		var self = this;
		Q.when(driverInsightsProbe.getCarProbe(area), function(probes){
			if(probes.length > 0){
				var mo_id_condition = "(" + probes.map(function(probe){
					return "mo_id:"+probe.mo_id;
				}).join(" OR ") + ")";
				conditions.push(mo_id_condition);
				Q.when(self.getAlerts(conditions, includeClosed, limit), function(result){
					deferred.resolve(result);
				});
			}else{
				deferred.resolve({alerts: []});
			}
		});
		return deferred.promise;
	},
	getAlerts: function(conditions, includeClosed, limit){
		var opt = {sort: "-ts", include_docs:true};
		if(conditions.length > 0){
			_.extend(opt, {q: conditions.join(" AND "), limit: (limit || 10)});
			if(!includeClosed){
				opt.q += " AND closed_ts:\\-1";
			}
		}else{
			_.extend(opt, {q: includeClosed ? "*:*" : "closed_ts:\\-1"});
			if(limit){
				_.extend(opt, {limit: limit});
			}
		}
		var self = this;
		return this._searchAlertIndex(opt)
			.then(function(result){
				var alerts = (result.rows||[]).map(function(row){return _.extend(row.doc, row.fields);});
				setImmediate(function(){
					alerts.forEach(function(alert){self._cacheAlert(alert);});
				});
				return {alerts: alerts};
			});
	},

	_cacheAlert: function(alert){
		if(alert.closed_ts > 0){
			return;
		}
		var alertsForVehicle = this.currentAlerts[alert.mo_id];
		if(!alertsForVehicle){
			alertsForVehicle = this.currentAlerts[alert.mo_id] = {};
		}
		var existingAlert = alertsForVehicle[alert.source && alert.source.id];
		if(!existingAlert){
			alertsForVehicle[alert.source && alert.source.id] = alert;
		}else if(existingAlert._id !== alert._id){
			console.warn("[WARNING] _cacheAlert(Duplicate alert): Close older alert and cache newer alert.");
			console.warn("[WARNING] mo_id: " + alert.mo_id + ", source.type: " + alert.source.type + ", source.id: " + alert.source.id);
			console.warn("[WARNING] alert1._id: " + (existingAlert._id||"-") + ", alert2._id: " + (alert._id||"-"));
			if(existingAlert.ts > alert.ts){
				alert.closed_ts = moment().valueOf();
				this.updateAlert(alert);
			}else{
				alertsForVehicle[alert.source && alert.source.id] = alert;
				existingAlert.closed_ts = moment().valueOf();
				this.updateAlert(existingAlert);
			}
		}
	},
	addAlert: function(alert){
		var alertsForVehicle = this.alertsToInsert[alert.mo_id];
		if(!alertsForVehicle){
			alertsForVehicle = this.alertsToInsert[alert.mo_id] = {};
		}
		var alertToInsert = alertsForVehicle[alert.source && alert.source.id];
		if(!alertToInsert){
			debug("addAlert: " + JSON.stringify(alert));
			alertsForVehicle[alert.source && alert.source.id] = alert;
		}
		this._bulkInsert();
	},
	updateAlert: function(alert){
		if(!alert._id || !alert._rev){
			console.error({message: "_id and _rev are required to update alert: " + JSON.stringify(alert)});
		}
		var alertsForVehicle = this.alertsToInsert[alert.mo_id];
		if(!alertsForVehicle){
			alertsForVehicle = this.alertsToInsert[alert.mo_id] = {};
		}
		var alertToInsert = alertsForVehicle[alert.source && alert.source.id];
		if(alertToInsert){
			if(alertToInsert._id){
				if(alertToInsert._id === alert._id){
					// Duplicate inserts for the same cloudant document. Update for later revision and discard older revision
					if(Number(alertToInsert._rev.split("-")[0]) < Number(alert._rev.split("-"[0]))){
						console.warn("[WARNING] updateAlert(Duplicate inserts for the same cloudant document): " + JSON.stringify(alert));
						alertsForVehicle[alert.source && alert.source.id] = alert;
					}
				}else{
					// Duplicate documents for the same mo_id and source id. Close as invalid alert
					if(alertToInsert.closed_ts < 0 && alert.closed_ts < 0){
						console.warn("[WARNING] updateAlert(Duplicate open alerts for the same mo_id and source.id): Close and mark older alert as invalid. ");
						this.alertsToInsert["invalid"] = this.alertsToInsert["invalid"] || {};
						if(alertToInsert.ts > alert.ts){
							alert.closed_ts = alert.ts;
							this.alertsToInsert["invalid"][alert._id] = alert;
						}else{
							alertToInsert.closed_ts = alertToInsert.ts;
							alertsForVehicle[alert.source && alert.source.id] = alert; // Update as valid alert
							this.alertsToInsert["invalid"][alertToInsert._id] = alertToInsert;
						}
					}
				}
			}else{
				// The alert has already inserted. This must be invalid state.
				console.warn("updateAlert: " + JSON.stringify(alert));
				alertsForVehicle[alert.source && alert.source.id] = alert;
			}
		}else{
			debug("updateAlert: " + JSON.stringify(alert));
			alertsForVehicle[alert.source && alert.source.id] = alert;
		}
		this._bulkInsert();
	},
	_bulkInsert: function(){
		if(!this.insertTimeout){
			var self = this;
			this.insertTimeout = setTimeout(function(){
				Q.when(self.db, function(db){
					var docs = [];
					Object.keys(self.alertsToInsert).forEach(function(mo_id){
						Object.keys(self.alertsToInsert[mo_id]).forEach(function(sourceId){
							docs.push(self.alertsToInsert[mo_id][sourceId]);
						});
					});
					if(docs.length > 0){
						db.bulk({docs: docs}, "insert", function(err, body){
							if(err){
								console.error("inserting alerts failed");
								self.insertTimeout = null;
							}else{
								debug("inserting alerts succeeded");
								self.alertsToInsert = {};
								self.insertTimeout = null;
								body.forEach(function(inserted, index){
									if(inserted.error){
										self.addAlert(docs[index]);
									}else{
										var alert = docs[index];
										alert._id = inserted.id;
										alert._rev = inserted.rev;
										if(alert.closed_ts){
											delete self.currentAlerts[alert.mo_id][alert.source && alert.source.id];
											if(self.currentAlerts[alert.mo_id].length <= 0){
												delete self.currentAlerts[alert.mo_id];
											}
										}else{
											self._cacheAlert(alert);
										}
									}
								});
							}
						});
					}
				});
			}, BULK_INSERT_INTERVAL);
		}
	},
	deleteAlert: function(alertId){
		if(!alertId){
			return Q.reject({message: "alertId is required to delete alert."});
		}
		var deferred = Q.defer();
		//TODO
		return deferred.promise;
	},

	registerAlertRule: function(/*string*/name, /*function*/rule){
		this.alertRules[name] = rule;
	}
});

driverInsightsAlert._init();