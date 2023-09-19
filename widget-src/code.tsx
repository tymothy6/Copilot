const { widget } = figma
const { AutoLayout, Text, useEffect, useWidgetNodeId, useSyncedState, waitForTask } = widget

// Initialize the hidden UI used to make API calls outside of the widget code
figma.showUI(__html__, { width: 70, height: 0 });

function Copilot() {
  const widgetId = useWidgetNodeId();

  const [pendingApiCall, setPendingApiCall] = useSyncedState<string | null>("pendingApiCall", null);
  
  useEffect(() => {
    let resolvePromise: (() => void) | undefined;
    // Listen for selection changes
    const selectionChangeListener = () => {
      const selectedNodes = figma.currentPage.selection;
      console.log('Selection:', selectedNodes);

      if (selectedNodes.length === 1 && selectedNodes[0].type === 'STICKY') {
        const sticky = selectedNodes[0] as StickyNode;
        if (sticky.text && sticky.text.characters.length > 0) {
          setPendingApiCall(sticky.text.characters);
          resolvePromise?.();
        }
      } else {
        console.log('Select a sticky note with text to start');
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
    console.log("pendingApiCall:", pendingApiCall); // check that the synced state is set

    if(pendingApiCall) {
      console.log("Posting message with text:", pendingApiCall); // check the contents of the message

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
