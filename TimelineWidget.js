/*\
title: $:/plugins/OokTech/TimeLine/TimeLine.js
type: application/javascript
module-type: widget

Timeline widget

\*/
(function(){

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";
    
    var Widget = require("$:/core/modules/widgets/widget.js").widget;
    
    var TimelineWidget = function(parseTreeNode,options) {
        this.initialise(parseTreeNode,options);
    };
    
    /*
    Inherit from the base widget class
    */
    TimelineWidget.prototype = new Widget();
    
    /*
    Render this widget into the DOM
    */
    TimelineWidget.prototype.render = function(parent,nextSibling) {
        // Save the parent dom node
        this.parentDomNode = parent;
        // Compute our attributes
        this.computeAttributes();
        // Execute our logic
        this.execute();
        // Create our elements
        this.container = this.document.createElement("div");
        this.container.style = 'overflow-x:scroll;position:relative;';
        this.container.width = this.width;

        // Add a click event handler
        $tw.utils.addEventListeners(this.container, [
            {name:"mousemove",    handlerObject:this, handlerMethod:"handleMouseMoveEvent"},
            {name:"mouseleave",    handlerObject:this, handlerMethod:"handleMouseLeaveEvent"},
            {name:"mouseup",    handlerObject:this, handlerMethod:"handleMouseUpEvent"},
        ])
        // Insert the label into the DOM and render any children
        parent.insertBefore(this.container,nextSibling);
        this.domNodes.push(this.container);
    };
    
    TimelineWidget.prototype.handleMouseMoveEvent = function(event) {
        event.preventDefault();
        
    }

    // actionsStop
    TimelineWidget.prototype.handleMouseUpEvent = function(event) {
        event.preventDefault();

    }
    
    TimelineWidget.prototype.handleMouseLeaveEvent = function(event) {
        event.preventDefault();

    }
    
    /*
    Compute the internal state of the widget
    */
    TimelineWidget.prototype.execute = function() {
        this.start = this.getAttribute('start', '2022-01-01')
        this.end = this.getAttribute('end', '2023-01-01')
        this.handleWidth = this.getAttribute('handleWidth', 15)
        this.width = this.getAttribute('width', '100%')

        this.tiddler = this.getAttribute('tiddler', this.getVariable("currentTiddler"))
        this.startField = this.getAttribute('startField', 'start')
        this.endField = this.getAttribute('endField', 'end')

        this.binWidth = 10;

        // Make the child widgets
        this.makeChildWidgets();
    };
    
    /*
    Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
    */
    TimelineWidget.prototype.refresh = function(changedTiddlers) {
        var changedAttributes = this.computeAttributes();
        if($tw.utils.count(changedAttributes) > 0) {
            this.refreshSelf();
            return true;
        } else {
            var refreshed = false;
            if(changedTiddlers[this.tiddlerTitle]) {
                var value = this.getValue();
                if(this.inputDomNode.value !== value) {
                    this.inputDomNode.value = value;
                }
                refreshed = true;
            }
            return this.refreshChildren(changedTiddlers) || refreshed;
        }
    };
    
    exports.daterange = TimelineWidget;
    
    })();
    