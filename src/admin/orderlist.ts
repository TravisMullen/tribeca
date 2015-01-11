/// <reference path="../../typings/tsd.d.ts" />
/// <reference path="../common/models.ts" />
/// <amd-dependency path="ui.bootstrap"/>
/// <amd-dependency path="ngGrid"/>

import angular = require("angular");
import Models = require("../common/models");
import io = require("socket.io-client");
import moment = require("moment");
import Messaging = require("../common/messaging");

interface OrderListScope extends ng.IScope {
    order_statuses : DisplayOrderStatusReport[];
    cancel_replace_model : Models.ReplaceRequestFromUI;
    cancel : (o : DisplayOrderStatusReport) => void;
    cancel_replace : (o : DisplayOrderStatusReport) => void;

    gridOptions : any;
}

class DisplayOrderStatusReport {
    orderId : string;
    time : string;
    timeSortable : Date;
    exchange : string;
    pair : string;
    orderStatus : string;
    price : number;
    quantity : number;
    side : string;
    orderType : string;
    tif : string;
    computationalLatency : number;
    lastQuantity : number;
    lastPrice : number;
    leavesQuantity : number;
    cumQuantity : number;
    averagePrice : number;
    liquidity : string;
    rejectMessage : string;
    version : number;
    trackable : string;

    constructor(public osr : Models.OrderStatusReport) {
        this.pair = Models.Currency[osr.pair.base] + "/" + Models.Currency[osr.pair.quote];
        this.orderId = osr.orderId;
        this.exchange = Models.Exchange[osr.exchange];
        this.side = Models.Side[osr.side];
        this.updateWith(osr);
    }

    public updateWith = (osr : Models.OrderStatusReport) => {
        var parsedTime = (moment.isMoment(osr.time) ? osr.time : moment(osr.time));
        this.time = Models.toUtcFormattedTime(parsedTime);
        this.timeSortable = parsedTime.toDate();
        this.orderStatus = DisplayOrderStatusReport.getOrderStatus(osr);
        this.price = osr.price;
        this.quantity = osr.quantity;
        this.orderType = Models.OrderType[osr.type];
        this.tif = Models.TimeInForce[osr.timeInForce];
        this.computationalLatency = osr.computationalLatency;
        this.lastQuantity = osr.lastQuantity;
        this.lastPrice = osr.lastPrice;
        this.leavesQuantity = osr.leavesQuantity;
        this.cumQuantity = osr.cumQuantity;
        this.averagePrice = osr.averagePrice;
        this.liquidity = Models.Liquidity[osr.liquidity];
        this.rejectMessage = osr.rejectMessage;
        this.version = osr.version;
        this.trackable = osr.orderId + ":" + osr.version;
    };

    private static getOrderStatus(o : Models.OrderStatusReport) : string {
        var endingModifier = (o : Models.OrderStatusReport) => {
            if (o.pendingCancel)
                return ", PndCxl";
            else if (o.pendingReplace)
                return ", PndRpl";
            else if (o.partiallyFilled)
                return ", PartFill";
            else if (o.cancelRejected)
                return ", CxlRj";
            return "";
        };
        return Models.OrderStatus[o.orderStatus] + endingModifier(o);
    }
}

/*
        <th>cxl</th>
        <th>c-r</th>
    </tr>
    <tr ng-repeat="o in order_statuses|orderBy:'-timeSortable' track by o.trackable">
        <td>
            <button type="button"
                    class="btn btn-danger btn-xs"
                    ng-click="cancel(o)"><span class="glyphicon glyphicon-remove"></span></button></td>
        <td>
            <button type="button"
                    class="btn btn-warning btn-xs"
                    id="cancel_replace_form"
                    mypopover popover-template="cancel_replace_form.html"
                    data-placement="left"><span class="glyphicon glyphicon-refresh"></span></button></td>
 */


var OrderListController = ($scope : OrderListScope, $log : ng.ILogService, socket : SocketIOClient.Socket) => {
    $scope.cancel_replace_model = {price: null, quantity: null};
    $scope.order_statuses = [];
    $scope.gridOptions = {
        data: 'order_statuses',
        showGroupPanel: true,
        primaryKey: 'orderId',
        groupsCollapsedByDefault: true,
        enableColumnResize: true,
        sortInfo: {fields: ['time'], directions: ['desc']},
        columnDefs: [
            {width: 140, field:'time', displayName:'time'},
            {width: 100, field:'orderId', displayName:'id'},
            {width: 35, field:'version', displayName:'v'},
            {width: 60, field:'exchange', displayName:'exch'},
            {width: 60, field:'pair', displayName:'pair'},
            {width: 150, field:'orderStatus', displayName:'status'},
            {width: 65, field:'price', displayName:'px', cellFilter: 'currency'},
            {width: 60, field:'quantity', displayName:'qty'},
            {width: 50, field:'side', displayName:'side'},
            {width: 50, field:'orderType', displayName:'type'},
            {width: 50, field:'timeInForce', displayName:'tif'},
            {width: 35, field:'computationalLatency', displayName:'lat'},
            {width: 60, field:'lastQuantity', displayName:'lQty'},
            {width: 65, field:'lastPrice', displayName:'lPx', cellFilter: 'currency'},
            {width: 60, field:'leavesQuantity', displayName:'lvQty'},
            {width: 60, field:'cumQuantity', displayName:'cum'},
            {width: 65, field:'averagePrice', displayName:'avg', cellFilter: 'currency'},
            {width: 40, field:'liquidity', displayName:'liq'},
            {width: "*", field:'rejectMessage', displayName:'msg'}
        ]
    };

    $scope.cancel = (o : DisplayOrderStatusReport) => {
        socket.emit("cancel-order", o.osr);
    };

    $scope.cancel_replace = (o : DisplayOrderStatusReport) => {
        socket.emit("cancel-replace", o.osr, $scope.cancel_replace_model);
    };

    var addOrderRpt = (o : Models.OrderStatusReport) => {
        for (var i = $scope.order_statuses.length - 1; i >= 0; i--) {
            if ($scope.order_statuses[i].orderId === o.orderId) {
                $scope.order_statuses[i].updateWith(o);
                return;
            }
        }

        $scope.order_statuses.push(new DisplayOrderStatusReport(o));
    };

    var pair = new Models.CurrencyPair(Models.Currency.BTC, Models.Currency.USD);
    var topic = Messaging.ExchangePairMessaging.wrapExchangePairTopic(Models.Exchange.HitBtc, pair, Messaging.Topics.OrderStatusReports);
    new Messaging.Subscriber(topic, socket, $log.info)
        .registerConnectHandler(() => $scope.order_statuses.length = 0)
        .registerDisconnectedHandler(() => $scope.order_statuses.length = 0)
        .registerSubscriber(addOrderRpt, os => os.forEach(addOrderRpt));

    $log.info("started orderlist");
};

var orderListDirective = () : ng.IDirective => {
    return {
        restrict: "E",
        templateUrl: "orderlist.html"
    }
};

angular.module('orderListDirective', ['ui.bootstrap', 'ngGrid', 'sharedDirectives'])
       .controller('OrderListController', OrderListController)
       .directive("orderList", orderListDirective);