sap.ui.require(
    [
        'sap/fe/test/JourneyRunner',
        'upload/test/integration/FirstJourney',
		'upload/test/integration/pages/DocumentList',
		'upload/test/integration/pages/DocumentObjectPage'
    ],
    function(JourneyRunner, opaJourney, DocumentList, DocumentObjectPage) {
        'use strict';
        var JourneyRunner = new JourneyRunner({
            // start index.html in web folder
            launchUrl: sap.ui.require.toUrl('upload') + '/index.html'
        });

       
        JourneyRunner.run(
            {
                pages: { 
					onTheDocumentList: DocumentList,
					onTheDocumentObjectPage: DocumentObjectPage
                }
            },
            opaJourney.run
        );
    }
);