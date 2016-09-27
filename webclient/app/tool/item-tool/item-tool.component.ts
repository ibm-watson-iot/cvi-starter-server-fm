import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChange } from '@angular/core';
import { Router } from '@angular/router';

import { EventService } from '../../shared/iota-event.service';
import { GeofenceService } from '../../shared/iota-geofence.service';

declare var $; // jQuery from <script> tag in the index.html
// as bootstrap type definitoin doesn't extend jQuery $'s type definition

@Component({
  moduleId: module.id,
  selector: 'fmdash-item-tool',
  templateUrl: 'item-tool.component.html',
  styleUrls: ['item-tool.component.css']
})
export class ItemToolComponent implements OnInit {
  itemMap = null;
  eventTypes = [];
  selectedEventType = null;
  eventDirections = [{label: "North", value: 0}, {label: "North East", value: 45}, {label: "East", value: 90}, {label: "South East", value: 135},
                      {label: "South", value: 180}, {label: "South West", value: 225}, {label: "West", value: 270}, {label: "North West", value: 315}];
  eventDirection: number = 0;
  geofenceTypes = [{label: "Rectangle", value: "rectangle"}, {label: "Circle", value: "circle"}];
  geofenceType: string = "rectangle";
  geofenceDirections =  [{label: "OUT", value: "out"}, {label: "IN", value: "in"}];
  geofenceDirection: string = "out";
  creationMode: string = "none";

  constructor(
    private router: Router,
    private eventService: EventService,
    private geofenceService: GeofenceService
  ) {}

  ngOnInit() {
    this.eventService.getEventTypes().subscribe(data => {
      this.eventTypes = data;
      if (data.length > 0) {
        this.selectedEventType = data[0];
      }
    });
  }

  onChangeMode() {
    if (this.creationMode === "event") {
      this.itemMap.map.getViewport().style.cursor = "pointer";
    } else {
      this.itemMap.map.getViewport().style.cursor = "default";
    }
  }

  onCreateGeofence() {
    let extent = this.itemMap.getMapExtent();
    let offset_x = (extent.max_longitude - extent.min_longitude) / 4;
    let offset_y = (extent.max_latitude - extent.min_latitude) / 4;

    let range = null;
    if (this.geofenceType === "circle") {
      range = {
        longitude: (extent.max_longitude + extent.min_longitude) / 2,
        latitude: (extent.max_latitude + extent.min_latitude) / 2,
        radius: 1000
      };
    } else {
      range = {
        min_latitude: extent.min_latitude + offset_y,
        min_longitude: extent.min_longitude + offset_x,
        max_latitude: extent.max_latitude - offset_y,
        max_longitude: extent.max_longitude - offset_x
      };
    }
    return this.execute(new CreateGeofenceCommand(this.geofenceService, range, this.geofenceDirection));
  }

  setItemMap(itemMap) {
    this.itemMap = itemMap;
  }

  locationClicked(loc) {
    let extent = this.itemMap.getMapExtent();
    return this.execute(this.getLocationCommand(extent, loc));
  }

  deleteItem(item) {
    let extent = this.itemMap.getMapExtent();
    return this.execute(this.getDeleteItemCommand(item));
  }

  execute(command) {
    return new Promise((resolve, reject) => {
      if (!command) {
        return resolve({type: this.creationMode, data: null});
      }
      command.execute().subscribe(data => {
        this.itemMap.updateMapItems(command.getCommandTarget());
        let result = {type: this.creationMode, data: data};
        resolve(result);
      }, error => {
        reject(error);
      });
    });
  }

  getCommandExecutor() {
    return this;
  }

  getLocationCommand(range, loc): ToolCommand {
    if (this.creationMode === "event") {
      return new CreateEventCommand(this.eventService, range, loc, this.selectedEventType, this.eventDirection);
    }
  }

  getMoveCommand(item, delta): ToolCommand {
    if (item.getItemType() === "geofence") {
      let geometry = item.geometry;
      if (!isNaN(geometry.min_longitude)) {
        geometry.min_longitude += delta[0];
        geometry.max_longitude += delta[0];
        geometry.min_latitude += delta[1];
        geometry.max_latitude += delta[1];
      }
      if (!isNaN(geometry.longitude)) {
        geometry.longitude += delta[0];
        geometry.latitude += delta[1];
      }
      return new UpdateGeofenceCommand(this.geofenceService, item.getId(), geometry, item.direction);
    } else {
      item.s_longitude += delta.deltaX;
      item.s_latitude += delta.deltaY;
      return new UpdateEventCommand(this.eventService, item.getId(), item);
    }
  }

  getResizeCommand(item, delta, handleIndex) {
    if (item.getItemType() === "geofence") {
      let geometry = item.geometry;
      if (isNaN(geometry.longitude)) {
        return;
      }
      if (handleIndex === 0) {
        geometry.min_longitude += delta[0];
        geometry.min_latitude += delta[1];
      } else if (handleIndex === 1) {
        geometry.min_longitude += delta[0];
        geometry.max_latitude += delta[1];
      } else if (handleIndex === 2) {
        geometry.max_longitude += delta[0];
        geometry.max_latitude += delta[1];
      } else if (handleIndex === 3) {
        geometry.max_longitude += delta[0];
        geometry.min_latitude += delta[1];
      }
      if (geometry.min_longitude > geometry.max_longitude) {
        let lon = geometry.min_longitude;
        geometry.min_longitude = geometry.max_longitude;
        geometry.max_longitude = lon;
      }
      if (geometry.min_latitude > geometry.max_latitude) {
        let lat = geometry.min_latitude;
        geometry.min_latitude = geometry.max_latitude;
        geometry.max_latitude = lat;
      }
      return new UpdateGeofenceCommand(this.geofenceService, item.getId(), geometry, item.direction);
    }
  }

  getUpdateCommand(item, params): ToolCommand {
    if (item.getItemType() === "geofence") {
      return new UpdateGeofenceCommand(this.geofenceService, item.getId(), params.geometry, params.direction);
    }
  }

  getDeleteItemCommand(item): ToolCommand {
    if (item.getItemType() === "event") {
      return new DeleteEventCommand(this.eventService, item.event_id);
    } else if (item.getItemType() === "geofence") {
      return new DeleteGeofenceCommand(this.geofenceService, item.id);
    }
  }
}

/*
* Commands pattern to create, update and delete items
*/
export class ToolCommand {
  constructor(private commandType: string = "unknown") {
  }
  public getCommandTarget() {
    return this.commandType;
  }
  public execute() {};
}

export class CreateEventCommand extends ToolCommand {
  constructor(private eventService, private extent, private loc, private eventType, private direction) {
    super("event");
  }
  execute() {
    let date = new Date();
    let currentTime = date.toISOString();
    let params: any = {
        event_type: this.eventType.event_type,
        s_latitude: this.loc.latitude,
        s_longitude: this.loc.longitude,
        event_time: currentTime,
        start_time: currentTime,
        heading: this.direction
      };
    if (this.eventType.description) {
      params.event_name = this.eventType.description;
    }
    if (this.eventType.category) {
      params.event_category = this.eventType.category;
    }
    return this.eventService.createEvent(params);
  }
}

export class UpdateEventCommand extends ToolCommand {
  constructor(private eventService, private event_id, private event) {
    super("event");
  }
  public execute() {
    return this.eventService.updateEvent(this.event_id, event);
  }
}

export class DeleteEventCommand extends ToolCommand {
  constructor(private eventService, private event_id) {
    super("event");
  }
  public execute() {
    return this.eventService.deleteEvent(this.event_id);
  }
}

export class CreateGeofenceCommand extends ToolCommand {
  constructor(private geofenceService, private geometry, private direction) {
    super("geofence");
  }
  public execute() {
    let geometry_type = this.geometry.radius ? "circle" : "rectangle";
    let geofence = {
      direction: this.direction,
      geometry_type: geometry_type,
      geometry: this.geometry
    };
    return this.geofenceService.createGeofence(geofence);
  }
}

export class UpdateGeofenceCommand extends ToolCommand {
  constructor(private geofenceService, private geofence_id, private geometry, private direction) {
    super("geofence");
  }
  public execute() {
    let geometry_type = this.geometry.radius ? "circle" : "rectangle";
    let geofence = {
      direction: this.direction,
      geometry_type: geometry_type,
      geometry: this.geometry
    };
    return this.geofenceService.updateGeofence(this.geofence_id, geofence);
  }
}

export class DeleteGeofenceCommand extends ToolCommand {
  constructor(private geofenceService, private geofence_id) {
    super("geofence");
  }
  public execute() {
    return this.geofenceService.deleteGeofence(this.geofence_id);
  }
}
