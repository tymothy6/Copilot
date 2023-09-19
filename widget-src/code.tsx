const { widget } = figma
const { AutoLayout, Text, useEffect, useWidgetNodeId, useSyncedState, waitForTask } = widget

// Initialize the iframe used to make API calls outside of the widget code
figma.showUI(__html__, { width: 70, height: 0 });

function Copilot() {
  const widgetId = useWidgetNodeId();

  const [pendingApiCall, setPendingApiCall] = useSyncedState<string | null>("pendingApiCall", null);
  
  useEffect(() => {
    let resolvePromise: (() => void) | undefined;
    // Listen for selection changes, iterating through the page children to check for connectors between the widget and a sticky
    const selectionChangeListener = () => {
      const selectedNodes = figma.currentPage.selection;
      console.log('Selection:', selectedNodes); // 0. Check that the selection is found 
      console.log('Page children:', figma.currentPage.children); // 0. Check that the page children are found 

      for (const node of selectedNodes) {
        if (node.type !== 'STICKY') continue;
          console.log('Sticky selected:', node); // 1. Check that the sticky is selected 
          console.log('Selection id:', node.id); // testing

          for (const child of figma.currentPage.children) {
            if (child.type !== 'CONNECTOR') continue;
            console.log('Searching for connectors'); // 1. Check that the search for connectors is triggered 
            const connector = child as ConnectorNode;

            let startNode: StickyNode | undefined;
            let endNode: WidgetNode | undefined;

            if ('endpointNodeId' in connector.connectorStart) {
              startNode = figma.getNodeById(connector.connectorStart.endpointNodeId) as StickyNode;
            }

            if ('endpointNodeId' in connector.connectorEnd) {
              endNode = figma.getNodeById(connector.connectorEnd.endpointNodeId) as WidgetNode;
            }
            
            console.log('startNode:', startNode); // testing
            console.log('endNode:', endNode); // testing
            
            if(!startNode || !endNode) continue;

            const isStickyConnectedToWidget = (startNode.id === node.id && endNode.id === widgetId) ||
                                            (endNode.id === node.id && startNode.id === widgetId);

            if (isStickyConnectedToWidget) {
              const stickyText = startNode.text.characters; 
              console.log('stickyText:', stickyText); // 2. Check that the sticky text is found
              setPendingApiCall(stickyText);
              console.log('pendingApiCall:', pendingApiCall); // 3. Check that the synced state is set
              break;
            }
          }
        }
      };

    waitForTask(new Promise<void>(resolve => {
      resolvePromise = resolve;
      figma.on('selectionchange', selectionChangeListener);
    }));

    return () => {
      figma.off('selectionchange', selectionChangeListener);
    };
  })

  const handleJamClick = () => { 
    console.log("handleJamClick triggered"); // check that the function is triggered

    if(pendingApiCall) {
      console.log("Posting message:", pendingApiCall); // check the contents of the message

      // Start the async task
      const apiCallTask = new Promise<void>((resolve, reject) => {
        const handleApiResponse = (event: any) => {
          console.log("handleApiResponse triggered with data:", event.data);

          if (event.type === 'apiResponse') {
            const completionText = event.data.choices[0].message.content;
    
            // Create a new sticky note using the widget position as reference
            const newSticky = figma.createSticky();
            newSticky.text.characters = completionText || '';
    
            const widgetNode = figma.getNodeById(widgetId) as WidgetNode;
    
            if (widgetNode) {
              newSticky.x = widgetNode.x + widgetNode.width + 100;
              newSticky.y = widgetNode.y;
            }
    
            // Create a connector between the widget and the new sticky
            const connector = figma.createConnector();
            connector.connectorStart = {
              endpointNodeId: widgetId,
              magnet: 'AUTO'
            };
            connector.connectorEnd = {
              endpointNodeId: newSticky.id,
              magnet: 'AUTO'
            };
            resolve();
          }
        };

        figma.ui.onmessage = handleApiResponse;
        figma.ui.postMessage({ type: 'makeApiCall', text: pendingApiCall });
        waitForTask(apiCallTask);

        setPendingApiCall(null); // Reset the pending API call
      });
    }
  }

  return (
    <AutoLayout 
      fill={'#424242'} 
      cornerRadius={8}
      spacing={8}
      direction="vertical"
      padding={{ left: 16, right: 16, top: 12, bottom: 12 }}
      stroke={{
        type: 'solid',
        color: '#D5D5D5',
      }}
    >
        <Text 
        fontSize={24} 
        fontWeight={600} 
        letterSpacing={0.5} 
        fill={'#FAFAFA'}
        horizontalAlignText="center"
        >
        🤖 Copilot
        </Text>
        <AutoLayout 
          verticalAlignItems="center"
          fill={'#6046FF'} 
          cornerRadius={8}
          padding={{ left: 12, right: 12, top: 8, bottom: 8 }}
          stroke={{
            type: 'solid',
            color: '#121212',
          }}
          onClick={handleJamClick}
          >
            <Text fontSize={24} fontWeight={500} fill={'#FAFAFA'}>Let's jam!</Text>
          </AutoLayout>

    </AutoLayout>
  );
}

widget.register(Copilot)
