/**
 * TODO document
 */

var DSpace = function(){

  /**
   * expects a config object
   * FIXME set defautls to override and don't crash if no options ;) -- default in User model ?
   */
  this.init = function ( config ){

    /**
     * require dependencies with Ender
     * FIXME document (ex does order matter)?
     */
    var Backbone = require('backbone');
    var _ = require('underscore');
    var Reqwest = require('reqwest');
    var morpheus = require('morpheus');

    /**
     * single geographical featue of interest
     * with option to set from geoJSON feature object
     */
    var Feature = Backbone.Model.extend({

      initialize: function(){
        this.setLatLon();
      },

      /**
       * helper method for setting lat: lon: attributes from coordinates array
       */
      setLatLon: function(){
        var g = this.get('geometry');
        if( typeof g !== 'undefined' && 'coordinates' in g && g.coordinates.length == 2 ) {
          this.set({ lat: g.coordinates[1], lon: g.coordinates[0] }); //FIXME
        }
      }
    });
    var FeatureCollection = Backbone.Collection.extend({

      model: Feature,
      initialize: function( options ){
        this.url = options.url;
        this.name = options.name;
      },

      /**
       * requests the geojson
       * resets ifselft with the result
       * FIXME improve documentation
       */
      sync: function(){
        var self = this;
        var request = new Reqwest({
          url: this.url,
          type: 'json',
          success: function( response ) {
            self.reset( response.features ); },
            failure: function( e ) {
              alert( '#FIXME' ); }
        });
      },

      /**
       * override toJSON to adds a number to features's toJSON
       * so we can style markers with letters etc
       */
      toJSON: function( ) {
        var mappedJson = _(this.models).map( function(feature, index){
          feature.set( 'index', index );
          var featureJson = feature.toJSON();
          return featureJson;
        });
        return mappedJson;
      }

    });

    /**
     * Add basic user model
     */
    var User = Backbone.Model.extend({

        initialize: function() {

        this.world = this.get('world');

        /*
         * Start the geolocation
         * we bind user to update funtion to have it in callback as this
         * FIXME fallback when geolocations not allowed...
         */
        this.watch = navigator.geolocation.watchPosition (
          this._updateGeoLocation.bind(this), // FIXME: Why doesn't this work without underscores?
          this._reportGeoError.bind(this), {
            enableHighAccuracy : true
        });

        // Set a timeout in case the geolocation accuracy never meets the threshold.
        this.timeout = setTimeout(this._timeoutHandler.bind(this), 60000);

      },

      /*
       *  Update user's current geoLocation
       */
      _updateGeoLocation: function(geolocation) {
        this.set( 'geoLocation',  geolocation);
        if (geolocation.coords.accuracy < 50) {
          // FIXME: do something if this offset gets to crazy
        }
      },

      _reportGeoError: function(geolocation) {
          // FIXME: console.log(geolocation);
      },

      _timeoutHandler: function(geolocation) {
          // FIXME: console.log(geolocation);
      },

    });


    /**
     * main UI logic for the Map
     */
    var Map = Backbone.View.extend({

      el: $('#map'),

      events: {
        "click": "clearAll"
        ,"contextmenu": "mapContext"
      },

      initialize: function(){

          /**
           * to use with map.world FIXME
           */
          this.world = this.options.world;

          /**
           * listen to world changes nothing todo here yet
           */
          this.world.on( 'all', function( e, v ) {
            console.log({ world: e, v: v });
          });

          /**
           * stores config passed from world
           */
          this.config = this.options.config;

          this.fullScreen = false;

          /**
           * to keep track on overlays and feature boxes
           */
          this.overlays = [];
          this.featureBoxes = [];

          /**
           * Map Context Menu Template
           */
          this.template = Handlebars.templates['mapContext'];

          /**
           * define relations to other views
           */
          this.statusPanel = new StatusPanel({model: this.world.user});
          this.controlPanel = new ControlPanel({ map: this });
      },

      /**
       * Failsafe: A click on the map should clear all modal/context windows
       */
      clearAll: function () {
        if($('#mapContext').css( 'opacity' ) === '1' ) {
          $('#mapContext').fadeOut(350, function() { $('#mapContext').hide(); });
        }
      },

      /**
       *  Map right-click/long touch context menu
       */
      mapContext: function () {
        if($('#mapContext').css( 'opacity' ) === '1' ) {
          $('#mapContext').fadeOut(350, function() { $('#mapContext').hide(); });
        } else {
          $('#mapContext').css( { 'left': cursorX, 'top': cursorY });
          $('#mapContext').css( { 'display': 'block'});
          $('#mapContext').fadeIn(350);
        }
      },

      /**
       * renders the map
       */
      render: function(){

        /**
         * crate frame -- uses MapBox
         */
        this.frame = this.createFrame();

        /**
         * create StatusPanel with model user
         */
        this.statusPanel.render();
        this.statusPanel.visible = true;

        /**
         * create ControlPanel
         * set controlPanel model to map
         */
        this.controlPanel.render();
        this.controlPanel.visible = true;


        /**
         * create overlay collection and markers
         * sync active feature collection when all items are bound
         */
        var feeds = this.world.get( 'geoFeeds' );
        overlays = [];
        for( var i = feeds.length; i--; ) {
          overlays.push(
            new Overlay({
                collection: new FeatureCollection( feeds[i] )
              , map: this })); }


        this.world.set( 'overlays', overlays );
        this.featureBox = new FeatureBox({ map: this });

        this.featureBox.setFeatureCollection( overlays[1].collection );
        overlays[1].collection.sync( );
        this.featureBox.visible = true;

        /**
         * create miniMap
         */
        this.miniMap = new MiniMap();
        this.miniMap.visible = true;
        //FIXME add render!

      },

      /**
       * toggles state (on/off) for #featureBox
       */
      boxToggle: function() {
        this.featureBox.toggle();
      },

      miniMapToggle: function() {
        this.miniMap.toggle();
      },

      fullscreenToggle: function() {
        if(this.fullScreen) {
          this.miniMap.show()
          this.statusPanel.show();
          this.featureBox.show();
          this.fullScreen = false;
        } else {
          this.miniMap.hide()
          this.statusPanel.hide();
          this.featureBox.hide();
          this.fullScreen = true;
        }
      },

      /**
       * creates frame using ModestMaps library
       */
      createFrame: function(){
        var self = this;
        var modestmaps = com.modestmaps;

        var config = this.config;

        var template = config.tileSet.template; //FIXME introduce BaseMap
        var layer = new MM.TemplatedLayer(template); //FIXME

        var modestmap = new modestmaps.Map(
          'map',
          layer,
          null,
          [new easey_handlers.TouchHandler(),
           new easey_handlers.DragHandler(),
           new easey_handlers.MouseWheelHandler()]
        );

        /**
         *  setup boundaries
         */
        modestmap.setZoomRange(config.minZoom, config.maxZoom);
        var location = new modestmaps.Location(config.geolat, config.geolon);

        /**
         * show and zoom map
         */
        modestmap.setCenterZoom(location, config.defaultZoom);

        /**
         * FIXME add modestmap.addCallback('drawn', function(m){});
         * here we can update center location and zoom level display
         */
        modestmap.addCallback('drawn', function(m){
          self.controlPanel.render();
        });
        return modestmap;

      },

      addMapLayer: function( collection ){
        /**
         * Add markers
         * mapbox lib NOT same as ModestMap
         */
        var markerLayer = mapbox.markers.layer();

        /**
         * define a factory to make markers
         */
        markerLayer.factory(function(featureJson){
           return new Marker({ featureJson: featureJson }).render( );
        });
        /**
         * display markers MM adds it to DOM
         * .extent() called to redraw map!
         */
        markerLayer.features( collection.toJSON( ));
        this.frame.addLayer(markerLayer).setExtent(markerLayer.extent());
      },

      /**
       * animates map to focus location
       * gets feature f
       */
      jumpToFeature: function( f ) {

        /**
         * easey interaction library for modestmaps
         */
        var mmCoordinate = this.frame.locationCoordinate({
            lat: f.get( 'lat' ),
            lon: f.get( 'lon' ) });

        /**
         * TODO document
         */
        easey().map(this.frame)
        .to(mmCoordinate)
        .zoom(this.config.maxZoom).optimal();
      },

      /**
       * delegates to modest map and
       * maybe rename
       * returns MM.Location of center
       */
      getCenter: function( ){
        return this.frame.getCenter();
      }
    });

    /**
     * UI element with information about feature
     */
    var FeatureBoxItem = Backbone.View.extend({

      className: 'featureBoxItem',

      initialize: function(){
        _.bindAll(this, 'render');

        /**
         * DOM template
         */
        this.template = Handlebars.templates['featureBoxItem'];
      },

     /**
      * gets model feature and index
      * and returns html
      */
      render: function(){
        var templateData = this.model.toJSON();
        this.$el.html(this.template(templateData));
        return this.el;
      },

      events: {
        "click": "setFeatureCurrent"
      },

      /**
       * sets linked Feature current
       */
      setFeatureCurrent: function( event ){
        this.model.trigger('featureboxitem:current', this );
      }
    });

    /**
     * UI element for showin mini map
     */
    var MiniMap = Backbone.View.extend({

      el: $('#miniMapCanvas'),

      show: function(){
        $(this.el).animate({ bottom: 10, duration: 600  });
        $(this.el).fadeIn(600);
        this.visible = true;
      },

      hide: function(){
        $(this.el).animate({ bottom: -250, duration: 600  });
        $(this.el).fadeOut(600);
        this.visible = false;
      },

      toggle: function(){
        if(this.visible) {
          this.hide();
        } else {
          this.show();
        }
      }
    });

    /**
     * UI element with list of features
     *
     * gets collection FeatureCollection
     * gets option map
     */
    var FeatureBox = Backbone.View.extend({

      el: $('#featureBox'),
      initialize: function(){
        var self = this;
        /*
         * convienience accessor to map
         * for use in callbacks
         */
        map = this.options.map;
      },
      setFeatureCollection: function( collection ){
        this.collection = collection;

        /*
         * listens to its FeatureCollection reset event
         */
        var self = this;
        this.collection.on( 'reset', function( event, data ){
          self.render( );
        });

        // listen for focus requests from features and
        // call map for focus
        this.collection.on( 'featureboxitem:current', function( event ){
console.log({ 'featurebox:current': event })
          map.jumpToFeature( event.model );
        });

      },

      render: function(){
        var self = this;
        /**
         * Loop through each feature in the model
         * example how to add more data to the view:
         */
        _(this.collection.models).each(function(feature, index){
          feature.set( 'index', index );
          var featureBoxItem= new FeatureBoxItem({
              model: feature
          });
          var renderedTemplate = featureBoxItem.render();

          /**
           * append to backbone provided $obj
           */
          self.$el.append(renderedTemplate);

        });
      },

      show: function(){
        $(this.el).animate({ top: 60, duration: 700  });
        $(this.el).fadeIn(600);
        this.visible = true;
      },

      hide: function(){
        $(this.el).animate({ top: -400, duration: 700 });
        $(this.el).fadeOut(600);
        this.visible = false;
      },

      toggle: function(){
        if(this.visible) {
          this.hide();
        } else {
          this.show();
        }
      }
    });

    /** @wip
     *
     * view for Overlay Markers
     * this creates creates a marker-image element and return the reference
     * for modesmap factory the element has to exist on the dom
     * modestmap sets pointer-events to none so we have to override it
     */
    var Marker = Backbone.View.extend({

      tagName: 'div',
      className: 'markerimage',

      events: {
         "click": "featureInfoModal"
        ,"contextmenu": "markerContext"
      },

      initialize: function(){
        this.featureJson = this.options.featureJson;

      },

      featureInfoModal: function(event) {
         console.log({ 'marker event': event, featureJson: this.featureJson }) ;
      },

      markerContext: function(event) {
         console.log({ 'marker context (right-click)': event, featureJson: this.featureJson }) ;
      },

      /** FIXME put into /templates
       * set icon according to index
       * set pointer-events active to override layer settings
       */
      //template: Handlebars.compile( '<img class="marker-image" src="icons/black-shield-{{index}}.png" pointer-events="auto" /> feature {{properties.title}}' ),
      template: Handlebars.compile( '<img src="assets/icons/black-shield-{{index}}.png" pointer-events="auto" />' ),

      render: function( ) {
          this.$el.html( this.template( this.featureJson ));
          this.$el.css( 'pointer-events', 'auto' );
          return this.el;
      }
    });

    /**
     * binds to FeatureCollection reset events.
     * adds the collection to the listbox
     * draws marker with mapbox
     *
     * gets FeatureCollection as collection
     * gets reference to the map
     */
    var Overlay = Backbone.View.extend({
      el: $('#map'),
      initialize: function() {
          var self = this;

          this.template = Handlebars.templates['featureInfoModal'];

          /*
           * convienience accessor to map
           */
          this.map = this.options.map;

          /*
           * listens to its FeatureCollection reset event
           */
          this.collection.on( 'reset', function( event, data ){
            self.render( );
          });
      },

      render: function(){
          var maplayer = this.map.addMapLayer( this.collection );
      },
    });



    /**
     * UI element to show current position in botttom left
     * gets model user and binds to all changes
     */
    var StatusPanel = Backbone.View.extend({

      el: $('#statusPanel'),

      events: {
          'click #userModeWalk': 'userModeWalk'
        , 'click #userModeDrive': 'userModeDrive'
        , 'click #userOptions': 'userOptions'
      },

      initialize: function() {
        _.bindAll(this, 'render');

        var self = this;
        this.model.on('change', function () {
          self.render();
        });

        /**
         * create convienience accessors
         */
        this.user = this.model;

        this.template = Handlebars.templates['statusPanel'];
        this.templates = {
          'userOptions': Handlebars.templates['userOptionModal']
        }

      },

      show: function(){
        $(this.el).show();
        $(this.el).fadeIn(450);
        this.visible = true;
      },

      hide: function(){
        $(this.el).fadeOut(450, function() { $(self.el).hide(); });
        this.visible = false;
      },

      toggle: function(){
        if(this.visible){
          this.hide()
        } else {
          this.show()
        }
      },

      /*
       *  help the system making decisions based
       *  on the user's mode of movement
       */

      userModeWalk: function(event) {
        this.model.set( 'usermode', 'walk' );
      },

      userModeDrive: function(event) {
        this.model.set( 'usermode', 'drive' );
      },

      userOptions: function(event) {
        if($('#userOptionModal').css( 'opacity' ) === '1' ) {
          $('#userOptionModal').fadeOut(350, function() { $('#userOptionModal').hide(); });
        } else {
          $('#userOptionModal').html( this.templates.userOptions( { ui: this.ui } ) );
          $('#userOptionModal').css( { 'display': 'block'});
          $('#userOptionModal').fadeIn(350);
        }
      },

      /**
       * TODO listen on map changing it's center
       */
      render: function(){
        var templateData = { user: this.user.toJSON() };
        $(this.el).html(this.template(templateData));
        return this.el;
      }
    });

    /**
     * UI element to show map controls
     */
    var ControlPanel = Backbone.View.extend({

      el: $('#controlPanel'),

      events: {
          'click #toggleFeatureBox': 'boxToggle'
        , 'click #toggleMiniMap': 'miniMapToggle'
        , 'click #toggleFullscreen': 'fullscreenToggle'
        , 'click #geobarOptions': 'geobarOptions'
        , 'click #featureOptions': 'featureOptions'
      },

      initialize: function() {

        _.bindAll(this, 'render');

         /**
         * create convienience accessors
         */
        this.map = this.options.map;
        this.template = Handlebars.templates['controlPanel'];
        this.templates = {
           'geobarOptions': Handlebars.templates['geobarOptionModal']
          ,'featureOptions': Handlebars.templates['featureOptionModal']
        }

      },

      boxToggle: function(event){
        this.map.boxToggle();
      },

      miniMapToggle: function(event){
        this.map.miniMapToggle();
      },

      fullscreenToggle: function(event){
        this.map.fullscreenToggle();
      },

      geobarOptions: function(event) {
        if($('#geobarOptionModal').css( 'opacity' ) === '1' ) {
          $('#geobarOptionModal').fadeOut(350, function() { $('#geobarOptionModal').hide(); });
        } else {
          $('#geobarOptionModal').html( this.templates.geobarOptions( { ui: this.ui } ) );
          $('#geobarOptionModal').css( { 'display': 'block'});
          $('#geobarOptionModal').fadeIn(350);
        }
      },

      featureOptions: function(event){
        if($('#featureOptionModal').css( 'opacity' ) === '1' ) {
          $('#featureOptionModal').fadeOut(350, function() { $('#featureOptionModal').hide(); });
        } else {
          $('#featureOptionModal').html( this.templates.featureOptions( { ui: this.ui } ) );
          $('#featureOptionModal').css( { 'display': 'block'});
          $('#featureOptionModal').fadeIn(350);
        }
      },

      /**
       * TODO listen on map changing it's center
       */
      render: function(){
        var mapCenter = this.map.getCenter();
        var mapData = { lat: mapCenter.lat, lon: mapCenter.lon };
        var templateData = {map: mapData};
        $(this.el).html(this.template(templateData));
        return this.el;
      }
    });

    var World = Backbone.Model.extend({

      /**
       * Genesis ;)
       */
      initialize: function( config ){
        var self = this;

        this.set( 'geofeed', config['geofeed'] );
        this.set( 'map', config['map'] );

        /**
         * create User
         */
        this.user = new User({world: this});

        /**
         * create and render Map
         */
        this.map = new Map({world: this, config: this.get( 'map' )});
        this.map.render();
      },

    });

    /**
     * init() returns an instance of a World
     */
    return new World( config );

  };

  /**
   * returns itself
   */
  return this;

};

