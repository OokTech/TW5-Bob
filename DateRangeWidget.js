/*\
title: $:/plugins/OokTech/DateRange/DateRange.js
type: application/javascript
module-type: widget

Date Range widget

\*/
(function(){

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";
    
    var Widget = require("$:/core/modules/widgets/widget.js").widget;
    
    var DateRangeWidget = function(parseTreeNode,options) {
        this.initialise(parseTreeNode,options);
    };
    
    /*
    Inherit from the base widget class
    */
    DateRangeWidget.prototype = new Widget();
    
    /*
    Render this widget into the DOM
    */
    DateRangeWidget.prototype.render = function(parent,nextSibling) {
        // Save the parent dom node
        this.parentDomNode = parent;
        // Compute our attributes
        this.computeAttributes();
        // Execute our logic
        this.execute();
        // Create our elements
        this.container = this.document.createElement("div");
        this.lowDate = this.document.createElement("span");
        this.highDate = this.document.createElement("span");
        this.backgroundBar = this.document.createElement("div");
        this.selectedBar = this.document.createElement("div");
        this.lowMarker = this.document.createElement("div");
        this.highMarker = this.document.createElement("div");
        this.selectedDates = this.document.createElement("div");

        this.container.appendChild(this.lowDate);
        this.container.appendChild(this.highDate);
        this.container.appendChild(this.backgroundBar);
        this.container.appendChild(this.selectedDates);

        this.backgroundBar.appendChild(this.selectedBar);
        this.backgroundBar.appendChild(this.lowMarker);
        this.backgroundBar.appendChild(this.highMarker);

        this.container.style = 'overflow:visible;position:relative;';
        this.lowDate.style = 'pointer-events:none;user-select:none;position:relative;';
        this.highDate.style = 'pointer-events:none;user-select:none;position:absolute;right:0px;';
        this.backgroundBar.style = 'position:relative;width:100%;height:7px;background-color:lightblue;margin-top:10px;border-radius:5px;overflow:visible;';
        this.selectedBar.style = 'position:absolute;width:50px;height:100%;background-color:blue;'//pointer-events:none;';
        this.lowMarker.style = 'position:absolute;width:10px;height:20px;border-radius:10px 0px 0px 10px;background-color:pink;top:-7px;';
        this.highMarker.style = 'position:absolute;width:10px;height:20px;border-radius:0px 10px 10px 0px;background-color:orange;top:-7px;';
        this.selectedDates.style = 'position:relative;text-align:center;pointer-events:none;user-select:none;top:7px;';

        this.lowMarker.style.width = this.handleWidth + 'px';
        this.highMarker.style.width = this.handleWidth + 'px';
        this.container.width = this.width;

        this.selectedDates.innerHTML = new Date(this.end).toLocaleDateString('EN-GB')
        this.selectedBar.style.left = (this.lowDate.getBoundingClientRect().right - this.handleWidth) + 'px';
        this.selectedBar.style.width = this.highDate.getBoundingClientRect().left - this.lowDate.getBoundingClientRect().right + 'px';
        this.lowDate.innerHTML = this.start
        this.highDate.innerHTML = this.end

        // Add a click event handler
        $tw.utils.addEventListeners(this.lowMarker,[
            {name:"mousedown", handlerObject:this, handlerMethod:"handleLowMouseDownEvent"},
        ]);
        $tw.utils.addEventListeners(this.highMarker,[
            {name:"mousedown", handlerObject:this, handlerMethod:"handleHighMouseDownEvent"},
        ]);
        $tw.utils.addEventListeners(this.container, [
            {name:"mousemove",    handlerObject:this, handlerMethod:"handleMouseMoveEvent"},
            {name:"mouseleave",    handlerObject:this, handlerMethod:"handleMouseLeaveEvent"},
            {name:"mouseup",    handlerObject:this, handlerMethod:"handleMouseUpEvent"},
        ]);
        $tw.utils.addEventListeners(this.selectedBar, [
            {name:"mousedown", handlerObject:this, handlerMethod:"handleBarMouseDownEvent"},
        ])
        // Insert the label into the DOM and render any children
        parent.insertBefore(this.container,nextSibling);
        const full = this.backgroundBar.getBoundingClientRect().width;
        const oneDay = 24 * 60 * 60 * 1000;
        const startOne = new Date(this.start);
        const endOne = new Date(this.end);
        const totalDays = Math.round(Math.abs(endOne.valueOf() - startOne.valueOf()) / oneDay);
        this.binWidth = full / totalDays;

        // the start date thing
        // the scale factor to use to translate from the timestamp to pixels
        const scaleFactor = full / (new Date(this.end).valueOf() - new Date(this.start).valueOf())
        const startIndex = (this.theStartDate.valueOf() - new Date(this.start).valueOf()) * scaleFactor
        // the end date thing
        const endIndex = (this.theEndDate.valueOf() - new Date(this.start).valueOf()) * scaleFactor
        // the actual dates
        this.lowMarker.style.left = (startIndex - this.binWidth) + 'px';
        this.highMarker.style.left = (endIndex + this.binWidth) + 'px';
        this.selectedBar.style.left = this.lowMarker.getBoundingClientRect().right - this.backgroundBar.getBoundingClientRect().left + 'px';
        this.selectedBar.style.width = this.highMarker.getBoundingClientRect().left - this.lowMarker.getBoundingClientRect().right + 'px';
        this.domNodes.push(this.container);
    };
    
    // actionsStart
    DateRangeWidget.prototype.handleLowMouseDownEvent = function(event) {
        event.preventDefault();
        this.isDownLow = true;
        this.startOffset = this.lowMarker.offsetLeft - event.clientX;
    }

    DateRangeWidget.prototype.handleHighMouseDownEvent = function(event) {
        event.preventDefault();
        this.isDownHigh = true;
        this.startOffset = this.highMarker.offsetLeft - event.clientX;
    }

    DateRangeWidget.prototype.handleBarMouseDownEvent = function(event) {
        event.preventDefault();
        this.isDownBar = true;
        this.highStartOffset = this.highMarker.offsetLeft - event.clientX;
        this.lowStartOffset = this.lowMarker.offsetLeft - event.clientX;
    }
    
    DateRangeWidget.prototype.handleMouseMoveEvent = function(event) {
        event.preventDefault();
        if (this.isDownLow) {
            this.lowMarker.style.left = (event.clientX + this.startOffset) + 'px';
            if (this.lowMarker.getBoundingClientRect().right - this.backgroundBar.getBoundingClientRect().left >= this.backgroundBar.getBoundingClientRect().width) {
                this.lowMarker.style.left = (this.backgroundBar.getBoundingClientRect().width - this.handleWidth) + 'px';
            }
            if (this.lowMarker.getBoundingClientRect().right <= this.backgroundBar.getBoundingClientRect().left) {
                this.lowMarker.style.left = -1.0 * this.handleWidth + 'px'
            }
            if(this.lowMarker.getBoundingClientRect().right > this.highMarker.getBoundingClientRect().left) {
                this.highMarker.style.left = (this.lowMarker.getBoundingClientRect().right - this.backgroundBar.getBoundingClientRect().left) + 'px';
            }
        }
        if (this.isDownHigh) {
            this.highMarker.style.left = (event.clientX + this.startOffset) + 'px';
            if(this.highMarker.getBoundingClientRect().left >= this.backgroundBar.getBoundingClientRect().right) {
                this.highMarker.style.left = this.backgroundBar.getBoundingClientRect().width + "px";
            }
            if(this.highMarker.getBoundingClientRect().left <= this.backgroundBar.getBoundingClientRect().left) {
                this.highMarker.style.left = "0px";
            }
            if(this.highMarker.getBoundingClientRect().left - this.handleWidth < this.lowMarker.getBoundingClientRect().left) {
                this.lowMarker.style.left = (this.highMarker.getBoundingClientRect().left - this.handleWidth - this.backgroundBar.getBoundingClientRect().left) + 'px';
            }
        }
        if (this.isDownBar) {
            this.highMarker.style.left = (event.clientX + this.highStartOffset) + 'px';
            this.lowMarker.style.left  = (event.clientX + this.lowStartOffset) + 'px';
            if (this.lowMarker.getBoundingClientRect().right - this.backgroundBar.getBoundingClientRect().left >= this.backgroundBar.getBoundingClientRect().width) {
                this.lowMarker.style.left = (this.backgroundBar.getBoundingClientRect().width - this.handleWidth) + 'px';
            }
            if (this.lowMarker.getBoundingClientRect().right <= this.backgroundBar.getBoundingClientRect().left) {
                this.lowMarker.style.left = -1.0 * this.handleWidth + 'px'
            }
            if(this.lowMarker.getBoundingClientRect().right > this.highMarker.getBoundingClientRect().left) {
                this.highMarker.style.left = (this.lowMarker.getBoundingClientRect().right - this.backgroundBar.getBoundingClientRect().left) + 'px';
            }
            if(this.highMarker.getBoundingClientRect().left >= this.backgroundBar.getBoundingClientRect().right) {
                this.highMarker.style.left = this.backgroundBar.getBoundingClientRect().width + "px";
            }
            if(this.highMarker.getBoundingClientRect().left <= this.backgroundBar.getBoundingClientRect().left) {
                this.highMarker.style.left = "0px";
            }
            if(this.highMarker.getBoundingClientRect().left - this.handleWidth < this.lowMarker.getBoundingClientRect().left) {
                this.lowMarker.style.left = (this.highMarker.getBoundingClientRect().left - this.handleWidth - this.backgroundBar.getBoundingClientRect().left) + 'px';
            }
        }
        if(this.isDownHigh || this.isDownLow || this.isDownBar) {
            this.selectedBar.style.left = this.lowMarker.getBoundingClientRect().right - this.backgroundBar.getBoundingClientRect().left + 'px';
            this.selectedBar.style.width = this.highMarker.getBoundingClientRect().left - this.lowMarker.getBoundingClientRect().right + 'px';

            // find the dates
            
            // the start date thing
            const startIndex = Math.floor((this.lowMarker.getBoundingClientRect().right - this.backgroundBar.getBoundingClientRect().left) / this.binWidth);
            // the end date thing
            const endIndex = Math.floor((this.highMarker.getBoundingClientRect().left - this.backgroundBar.getBoundingClientRect().left) / this.binWidth);
            // the actual dates
            const startOne = new Date(this.start);
            const oneDay = 24 * 60 * 60 * 1000;
            this.theStartDate = new Date(startOne.valueOf() + startIndex * oneDay);
            this.theEndDate = new Date(startOne.valueOf() + endIndex * oneDay);
            if(this.theStartDate.valueOf() === this.theEndDate.valueOf()) { // if the two dates are the same it is only one date
                this.selectedDates.innerHTML = new Date(this.theStartDate).toLocaleDateString('EN-GB');
            } else {
                this.selectedDates.innerHTML = new Date(this.theStartDate).toLocaleDateString('EN-GB') + "-" + new Date(this.theEndDate).toLocaleDateString('EN-GB');
            }
            this.wiki.setText(this.tiddler,this.startField,null,$tw.utils.stringifyDate(this.theStartDate),null);
            this.wiki.setText(this.tiddler,this.endField,null,$tw.utils.stringifyDate(this.theEndDate),null);
        }
    }

    // actionsStop
    DateRangeWidget.prototype.handleMouseUpEvent = function(event) {
        event.preventDefault();
        this.isDownHigh = false;
        this.isDownLow = false;
        this.isDownBar = false;
    }
    
    DateRangeWidget.prototype.handleMouseLeaveEvent = function(event) {
        event.preventDefault();
        this.isDownHigh = false;
        this.isDownLow = false;
        this.isDownBar = false;
    }
    
    /*
    Compute the internal state of the widget
    */
    DateRangeWidget.prototype.execute = function() {
        this.start = this.getAttribute('start', '2022-01-01')
        this.end = this.getAttribute('end', '2023-01-01')
        this.handleWidth = this.getAttribute('handleWidth', 15)
        this.width = this.getAttribute('width', '100%')

        this.tiddler = this.getAttribute('tiddler', this.getVariable("currentTiddler"))
        this.startField = this.getAttribute('startField', 'start')
        this.endField = this.getAttribute('endField', 'end')

        this.isDownHigh = false;
        this.isDownLow = false;
        this.isDownBar = false;

        this.binWidth = 10;

        // get the current values by loading from the start and end fields
        const thisTiddler = this.wiki.getTiddler(this.tiddler)
        if(thisTiddler) {
            this.theStartDate = $tw.utils.parseDate(thisTiddler.fields[this.startField]);
            this.theEndDate = $tw.utils.parseDate(thisTiddler.fields[this.endField]);
        } else {
            this.theStartDate = new Date(this.start)
            this.theEndDate = new Date(this.end)
        }
        // Make the child widgets
        this.makeChildWidgets();
    };
    
    /*
    Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
    */
    DateRangeWidget.prototype.refresh = function(changedTiddlers) {
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
    
    exports.daterange = DateRangeWidget;
    
    })();
    