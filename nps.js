/**
 * Copyright 2017,2019 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const router = module.exports = require('express').Router();
const fs = require("fs-extra");
const moment = require("moment");

USER_PROVIDED_VCAP_SERVICES = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');
const firstAccessDateCookie = "iota-fleetmanagement-first-access-date";

const username = (function () {
	let username;
	if (fs.existsSync("bmx_username.txt")) {
		return fs.readFileSync("bmx_username.txt", "utf8");
	}
})();

router.get("/nps", function (req, res) {
	let firstAccessDate = req.cookies[firstAccessDateCookie];
	if (!firstAccessDate) {
		res.cookie(firstAccessDateCookie, moment().valueOf(), { maxAge: 1000 * 60 * 60 * 24 * 365 });
	}
	const npsVar = getNPSVariables(firstAccessDate);
	res.send(npsVar);
});
router.get("/capability/nps", function (req, res) {
	res.send({ available: process.env.NPS_ENABLED != "false" && username });
});

const getNPSVariables = function (firstAccessDate) {
	// NPS
	const iotaCreds = USER_PROVIDED_VCAP_SERVICES.iotforautomotive || VCAP_SERVICES.iotforautomotive;
	let accountId = (function () {
		if (iotaCreds && iotaCreds.length > 0 && iotaCreds[0].credentials) {
			const credentials = iotaCreds[0].credentials;
			const vdh = (credentials.vehicle_data_hub && credentials.vehicle_data_hub.length > 0 && credentials.vehicle_data_hub[0]);
			if (vdh) {
				return vdh.split(".")[0] || "none";
			} else {
				// api should be starts with "https://"
				return credentials.api.substring("https://".length, credentials.api.indexOf("."));
			}
		}
		return "none";
	})();

	let daysSinceFirstLogin = 0;
	if (firstAccessDate) {
		const durationInMill = moment().valueOf() - firstAccessDate;
		daysSinceFirstLogin = Math.floor(moment.duration(durationInMill).asDays());
	}

	let IBM_Meta = {
		"offeringName": "IoT for Auto",
		"language": "en",
		"offeringId": "5737-B44",
		"highLevelOfferingName": "Watson IoT",
		"userFirstName": " ",
		"userLastName": " ",
		"userEmail": username || " ",
		"userId": username || " ",
		"userIdType": " ",
		"country": "US",
		"customerName": " ",
		"testData": false,
		"trialUser": "no",
		"otherAccountId": accountId,
		"otherAccountIdType": "IoT4A Tenant ID",
		"daysSinceFirstLogin": daysSinceFirstLogin,
		"quarterlyIntercept": "heavy"
	};

	if (process.env.NPS_TEST) {
		IBM_Meta.daysSinceFirstLogin += 30;
		IBM_Meta.noQuarantine = "yes";
		IBM_Meta.testData = true;
	}

	return IBM_Meta;
}
