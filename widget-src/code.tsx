const { widget } = figma
const { AutoLayout, Text, useEffect, useWidgetNodeId, useSyncedState, waitForTask } = widget

// Initialize the iframe used to make API calls outside of the widget code
// figma.showUI(__html__, { width: 70, height: 0 });
// Listen for console logs from the iframe
figma.ui.onmessage = (event) => {
  if (event.pluginMessage && event.pluginMessage.type === 'iframeLog') {
    console.log('iframe log:', event.message);
  }
};

function Copilot() {
  const widgetId = useWidgetNodeId();

  const [pendingApiCall, setPendingApiCall] = useSyncedState<string | null>("pendingApiCall", null); // useSyncedState expects a key and a default value
  const [accumulatedStickyTexts, setAccumulatedStickyTexts] = useSyncedState<string[]>("accumulatedStickyTexts", []);
  const [stickyFill, setStickyFill] = useSyncedState<ReadonlyArray<Paint> | null>("stickyFill", null);

  useEffect(() => {
    let resolvePromise: (() => void) | undefined;
    // Listen for document changes of the CreateChange type
    const documentChangeListener = (event: any) => {
      const newStickyTexts: string[] = []; // initialize an array to store the sticky texts

      for (const change of event.documentChanges) {
        // Check for CreateChange type (newly created connectors)
        if (change.type === "CREATE" && change.node.type === "CONNECTOR") {
          console.log('New connector created:', change.node); // check that the connector is created

          const connector = change.node as ConnectorNode;

          let startNode: StickyNode | undefined;
          let endNode: WidgetNode | undefined;

          if ('endpointNodeId' in connector.connectorStart) {
            startNode = figma.getNodeById(connector.connectorStart.endpointNodeId) as StickyNode;
          }

          if ('endpointNodeId' in connector.connectorEnd) {
            endNode = figma.getNodeById(connector.connectorEnd.endpointNodeId) as WidgetNode;
          }

          console.log('startNode:', startNode); // check that the start node is a sticky note
          console.log('endNode:', endNode); // check that the end node is a widget

          if (!startNode || !endNode) continue;

          const isStickyConnectedToWidget = (startNode.type === "STICKY" && endNode.id === widgetId); 
          // check that the connector is drawn from the sticky to the widget (not the other way around)

          if (isStickyConnectedToWidget) {
            newStickyTexts.push(startNode.text.characters); // add the sticky text to the array

            if (Array.isArray(startNode.fills)) {
              setStickyFill(startNode.fills); // update the sticky fill
            } else {
              setStickyFill(null);
            }
          }
        }
      }

      if (newStickyTexts.length > 0) {
        const newAccumulatedTexts = [...accumulatedStickyTexts, ...newStickyTexts];
        setAccumulatedStickyTexts(newAccumulatedTexts); // update the accumulated sticky texts
        console.log('New accumulated texts:', newAccumulatedTexts);
        const aggregatedText = newAccumulatedTexts.join('\n');
        console.log('Aggregated text:', aggregatedText);
        setPendingApiCall(aggregatedText); // update the pending API call
      }
    };

    waitForTask(new Promise<void>(resolve => {
      resolvePromise = resolve;
      figma.on('documentchange', documentChangeListener);
    }));

    return () => {
      figma.off('documentchange', documentChangeListener);
    };
  })

  async function handleApiResponse(data: any) {
    if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {
      const completionText = data.choices[0].message.content.trim();

      // Create a new sticky note using the widget position as reference
      const newSticky = figma.createSticky();
      if (stickyFill !== null) {
        newSticky.fills = stickyFill;
      }

      // Load the font before setting characters
      const defaultFont: FontName = { family: "Inter", style: "Regular" };
      await figma.loadFontAsync(defaultFont);
      newSticky.text.fontName = defaultFont;
     
      newSticky.text.characters = completionText || '';

      const widgetNode = figma.getNodeById(widgetId) as WidgetNode;

      if (widgetNode) {
        newSticky.x = widgetNode.x + widgetNode.width + 100;
        newSticky.y = widgetNode.y + (widgetNode.height / 2) - (newSticky.height / 2);
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

    } else {
      console.error("Error handling API response:", data);
    }
  }

  const handleJamClick = async () => { 
    console.log("handleJamClick triggered"); 

    if(pendingApiCall) {
      console.log("Making API call with:", pendingApiCall);

      try {
        const response = await fetch('https://vercel-tymothy6.vercel.app/api/openai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: "You are a helpful assistant." },
              { role: "user", content: pendingApiCall }
            ],
            model: "gpt-3.5-turbo",
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Received API response:', data);
          handleApiResponse(data);

          // reset the syncedStates when the API call is successful
          setPendingApiCall(null);
          setAccumulatedStickyTexts([]);
          setStickyFill(null);
        } else {
          console.error("Error making API call:", await response.text());
        }
      } catch (error) {
        console.error("Error making API call:", (error as Error).message);
      }

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
