sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'upload',
            componentId: 'DocumentList',
            contextPath: '/Document'
        },
        CustomPageDefinitions
    );
});