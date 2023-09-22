const { widget } = figma
const { AutoLayout, Text, Input, SVG, useEffect, useWidgetNodeId, useSyncedState, waitForTask } = widget

// Initialize the iframe used to make API calls outside of the widget code
// figma.showUI(__html__, { width: 70, height: 0 });

function Copilot() {
  const widgetId = useWidgetNodeId();
  const backArrowSvg = `
  <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 8L12 16L20 24" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg> `;

  // useSyncedState expects a key and a default value
  const [activeView, setActiveView] = useSyncedState<"initial" | "input" | "jam">("activeViewKey", "initial");
  const [selectedFunction, setSelectedFunction] = useSyncedState<string | null>("selectedFunction", null);
  const [additionalInput, setAdditionalInput] = useSyncedState<string | null>("additionalInput", null); // additional input for functions that need it

  const [pendingApiCall, setPendingApiCall] = useSyncedState<string | null>("pendingApiCall", null); 
  const [accumulatedStickyTexts, setAccumulatedStickyTexts] = useSyncedState<string[]>("accumulatedStickyTexts", []);
  const [stickyFill, setStickyFill] = useSyncedState<ReadonlyArray<Paint> | null>("stickyFill", null);

  const functionColourMap: Record<string, RGB> = {
    "Ideate": { r: 182, g: 255, b: 138 },
    "Teach me": { r: 255, g: 240, b: 187 },
    "Rabbit hole": { r: 103, g: 182, b: 255 },
    "Summarize": { r: 255, g: 143, b: 118 },
    "Rewrite": { r: 187, g: 175, b: 255 },
    "Code": { r: 78, g: 78, b: 78 },
  };

  async function selectionHandler (functionName: string) {
    try {
    // Create a new sticky note using the widget position as reference
    const blankSticky = figma.createSticky();
    const selectionFill = functionColourMap[functionName];
    if (!selectionFill) {
      console.error("No colour defined for: ${functionName}");
      return;
    }
    const newFill: Paint = {
      type: 'SOLID',
      color: selectionFill,
    };
    blankSticky.fills = [newFill];
    
    // Load the font before setting characters
    const defaultFont: FontName = { family: "Inter", style: "Medium" };
    await figma.loadFontAsync(defaultFont);
    blankSticky.text.fontName = defaultFont;

    if (!widgetId) {
      console.error("Widget ID not found");
      return;
    }
    const widgetNode = figma.getNodeById(widgetId) as WidgetNode;

    if (!widgetNode) {
      console.error("Widget node not found.");
      return;
    }

    if (widgetNode) {
      blankSticky.x = widgetNode.x + widgetNode.width - 100;
      blankSticky.y = widgetNode.y + (widgetNode.height / 2) - (blankSticky.height / 2);
    }
    // Create a connector between the widget and the blank sticky
    const connector = figma.createConnector();
    connector.connectorStart = {
      endpointNodeId: blankSticky.id,
      magnet: 'AUTO'
    };
    connector.connectorEnd = {
      endpointNodeId: widgetId,
      magnet: 'AUTO'
    };
  } catch (error) {
    console.error("Error creating blank sticky:", (error as Error).message);
  }
}

  // Handle option selection
  const handleFunctionSelection = (functionName: string) => {
    try {
    console.log("Function selected:", functionName)
    setSelectedFunction(functionName);
    selectionHandler(functionName);
    if (functionName === "Rewrite" || functionName === "Code") { // list functions that need additional input
      setActiveView("input");
    } else {
      setActiveView("jam");
    }
  } catch (error) {
    console.error("Error handling function selection:", (error as Error).message);
  }
}

  // Determine the input placeholder based on the selected function
  let inputPlaceholder = "Type here..."; // default value

  if (selectedFunction === "Rewrite") {
    inputPlaceholder = "In the style of...";
  } else if (selectedFunction === "Code") {
    inputPlaceholder = "🧑🏼‍💻 in Python, Java ...";
  }

  let jamPlaceholder = "Connect a sticky and..."; // default value

  if (selectedFunction === "Ideate") {
    jamPlaceholder = "Ideate...";
  } else if (selectedFunction === "Teach me") {
    jamPlaceholder = "Teach me...";
  } else if (selectedFunction === "Rabbit hole") {
    jamPlaceholder = "Rabbit hole...";
  } else if (selectedFunction === "Summarize") {
    jamPlaceholder = "Summarize...";
  } else if (selectedFunction === "Rewrite") {
    jamPlaceholder = "Rewrite...";
  } else if (selectedFunction === "Code") {
    jamPlaceholder = "Code something...";
  }

  useEffect(() => {
    let resolvePromise: (() => void) | undefined;
    const processedStickies = new Set(); // keep track of processed stickies

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
            const node = figma.getNodeById(connector.connectorStart.endpointNodeId);
            if (node && node.type === "STICKY") {
              startNode = node as StickyNode;
            }
          }

          if ('endpointNodeId' in connector.connectorEnd) {
            const node = figma.getNodeById(connector.connectorEnd.endpointNodeId);
            if (node && node.id === widgetId) {
              endNode = node as WidgetNode;
            }
          }

          console.log('startNode:', startNode); // debug to check that the start node is a sticky note
          console.log('endNode:', endNode); // debug to check that the end node is a widget

          if (!startNode || !endNode) continue;

          const isStickyConnectedToWidget = startNode && endNode && startNode.type === "STICKY" && endNode.id === widgetId; 
          // check that the connector is drawn from the sticky to the widget (not the other way around)

          if (isStickyConnectedToWidget) {
            // First check if the sticky has been processed before ..
            if (!processedStickies.has(startNode.id)) {
            newStickyTexts.push(startNode.text.characters); // add the sticky text to the array
            processedStickies.add(startNode.id); // add the sticky ID to the set

            if (Array.isArray(startNode.fills)) {
              setStickyFill(startNode.fills); // update the sticky fill
            } else {
              setStickyFill(null);
            }
          }
        }
      }
    }

      if (newStickyTexts.length > 0) {
        const newAccumulatedTexts = [...accumulatedStickyTexts, ...newStickyTexts];
        setAccumulatedStickyTexts(newAccumulatedTexts); // update the accumulated sticky texts

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

  async function createSticky(content: string) {
    try {
    // Create a new sticky note using the widget position as reference
    const newSticky = figma.createSticky();
    if (stickyFill !== null) {
      newSticky.fills = stickyFill;
    }
    // Load the font before setting characters
    const defaultFont: FontName = { family: "Inter", style: "Medium" };
    await figma.loadFontAsync(defaultFont);
    newSticky.text.fontName = defaultFont;
   
    newSticky.text.characters = content || '';

    if (!widgetId) {
      console.error("Widget ID not found");
      return;
    }
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
  } catch (error) {
    console.error("Error creating new sticky:", (error as Error).message);
  }
}

  async function createMultipleStickies(data: any) {
    try {
    if (data && data.choices && data.choices.length > 0) {
      // Load the font before setting characters
      const defaultFont: FontName = { family: "Inter", style: "Medium" };
      await figma.loadFontAsync(defaultFont);
      const newSection = figma.createSection();
      if (stickyFill !== null) {
        const newFill = { ...stickyFill[0] };
        newFill.opacity = 0.5;
        newSection.fills = [newFill];
      }
      newSection.name = selectedFunction || "Ideate"; // provide a default name if one is not provided
      
      if (!widgetId) {
        console.error("Widget ID not found");
        return;
      }

      const widgetNode = figma.getNodeById(widgetId) as WidgetNode;

      newSection.x = widgetNode.x + widgetNode.width + 100;
      newSection.y = widgetNode.y;

      let stickyHeight = 0; // determine this by the height of the first sticky
      let stickyWidth = 0; // determine this by the width of the first sticky

      data.choices.forEach((choice: any, index: number) => {
          const completionText = choice.message.content.trim();
          const newSticky = figma.createSticky();
          if (stickyFill !== null) {
            newSticky.fills = stickyFill;
          }
          newSticky.text.fontName = defaultFont;
          newSticky.text.characters = completionText || '';
          if (index === 0) {
            stickyHeight = newSticky.height;
            stickyWidth = newSticky.width;
          }
          // Place the stickies in a vertical arrangement within the section
          newSticky.x = newSection.x;
          newSticky.y = newSection.y + (index * (newSticky.height + 10)); // spacing between stickies = 10px
      });

      // Resize the section to fit the stickies
      const totalHeight = data.choices.length * (stickyHeight + 10);
      newSection.resizeWithoutConstraints(stickyWidth, totalHeight);

      // Draw a connector between the widget and the section
      const connector = figma.createConnector();
      connector.connectorStart = {
        endpointNodeId: widgetId,
        magnet: 'AUTO'
      };
      connector.connectorEnd = {
        endpointNodeId: newSection.id,
        magnet: 'AUTO'
      };

    } else {
      console.error("Error handling API response:", data);
    }
  } catch (error) {
    console.error("Error creating multiple stickies:", (error as Error).message);
  }
}

  type CodeLanguageValue = 'TYPESCRIPT' | 'CPP' | 'RUBY' | 'CSS' | 'JAVASCRIPT' | 'HTML' | 'JSON' | 'GRAPHQL' | 'PYTHON' | 'GO' | 'SQL' | 'SWIFT' | 'KOTLIN' | 'RUST' | 'BASH' | 'PLAINTEXT' | 'DART';
  function isCodeLanguage(lang: string): lang is CodeLanguageValue {
    const validLanguages: CodeLanguageValue[] = ['TYPESCRIPT', 'CPP', 'RUBY', 'CSS', 'JAVASCRIPT', 'HTML', 'JSON', 'GRAPHQL', 'PYTHON', 'GO', 'SQL', 'SWIFT', 'KOTLIN', 'RUST', 'BASH', 'PLAINTEXT', 'DART'];
    return validLanguages.includes(lang as CodeLanguageValue);
  }
    
  async function createCodeBlock(content: string) {
    try {
    const languageRegEx = /```(.*?)\n([\s\S]*?)```/g;
    const languageMatch = languageRegEx.exec(content); // note that languageMatch[0] returns the entire matched string 

    if (!languageMatch) {
      console.error("Error parsing code block. Please try again with a supported language.");
      return;
    }

    const defaultFont: FontName = { family: "Source Code Pro", style: "Medium" };
    await figma.loadFontAsync(defaultFont);

    // Match the language to the codeLanguage prop
    if (languageMatch) {
      const language = languageMatch[1].trim().toUpperCase(); // first match is the language right after the first triple backticks
      const code = languageMatch[2].trim(); // second match is the enclosed code
      // Create a new Code block using the widget position as reference
      const newCode = figma.createCodeBlock();
      newCode.code = code;

      if (isCodeLanguage(language)) {
        newCode.codeLanguage = language;
      } else {
        newCode.codeLanguage = 'PLAINTEXT';
      }

      if (!widgetId) {
        console.error("Widget ID not found");
        return;
      }
      const widgetNode = figma.getNodeById(widgetId) as WidgetNode;

      if (!widgetNode) {
        console.error("Widget node not found.");
        return;
      }

      if (widgetNode) {
      newCode.x = widgetNode.x + widgetNode.width + 100;
      newCode.y = widgetNode.y + (widgetNode.height / 2) - (newCode.height / 2);
      }
      // Create a connector between the widget and the code block
      const connector = figma.createConnector();
      connector.connectorStart = {
        endpointNodeId: widgetId,
        magnet: 'AUTO'
      };
      connector.connectorEnd = {
        endpointNodeId: newCode.id,
        magnet: 'AUTO'
      };
    }
  } catch (error) {
    console.error("Error creating code block:", (error as Error).message);
  }
}

  function handleApiResponse(data: any) {
    if (selectedFunction === "Ideate" || selectedFunction === "Rabbit hole") {
      createMultipleStickies(data);
    } else {
      if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {
        const completionText = data.choices[0].message.content.trim();

        if (selectedFunction === "Code") {
          createCodeBlock(completionText);
        } else {
        createSticky(completionText);
        }
      } else {
        console.error("Error handling API response:", data);
      }
    }
  }
  

  const handleJamClick = async () => { 
    console.log("handleJamClick triggered"); 

    if(pendingApiCall) {
      console.log("Making API call with:", pendingApiCall);

      let systemPrompt = "You are a helpful assistant."; 
      let userMessage = pendingApiCall; 
      let choices = 1;

      switch (selectedFunction) {
        case "Ideate":
          systemPrompt = "You are a helpful assistant for brainstorming ideas. You will provide concise answers of one sentence or less. Given the following, provide one related idea:";
          choices = 4;
          break;
        case "Teach me":
          systemPrompt = "You are a helpful teacher. Explain the following in simple terms:";
          break;
        case "Rabbit hole":
          systemPrompt = "You are a helpful assistant. You will provide concise answers of one sentence or less. You are going down a rabbit hole. Provide one example, idea, statistic, fact, or insight based on the following:";
          choices = 4;
          break;
        case "Summarize":
          systemPrompt = "You are a helpful assistant. Summarize the messages provided into a concise description.";
          break;
        case "Rewrite":
          systemPrompt = "You are a helpful assistant. Rewrite the message provided according to the specified requirements.";
          userMessage = pendingApiCall + (additionalInput || '');
          break;
        case "Code":
          systemPrompt = "You are a helpful assistant. Provide concise code in the requested language to implement the given task:";
          userMessage = pendingApiCall + (additionalInput || '');
          break;
        default:
          break;
      }

      try {
        const response = await fetch('https://vercel-tymothy6.vercel.app/api/openai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage }
            ],
            model: "gpt-3.5-turbo",
            n: choices // the number of responses to return in the message.choices array
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Received API response:', data);
          handleApiResponse(data);
          // reset the syncedStates when the API call is successful
          // setPendingApiCall(null);
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

  if (activeView === "initial") {
    return (
      <AutoLayout
      fill={'#F5F5F5'} 
      cornerRadius={8}
      spacing={8}
      direction="vertical"
      padding={{ left: 20, right: 20, top: 16, bottom: 16 }}
      stroke={{
        type: 'solid',
        color: '#D5D5D5',
      }}>
        <Text 
        fontFamily="Inter"
        fontSize={20} 
        fontWeight={600} 
        letterSpacing={0.5} 
        fill={'#444444'}
        horizontalAlignText="center"
        >
        🤖 Jam Copilot
        </Text>

        <AutoLayout verticalAlignItems="center" width="fill-parent" fill={'#B6FF8A'} stroke = {{ type: 'solid', color: '#D5D5D5' }} hoverStyle={{ fill: '#B6FF8A' }} cornerRadius={8} padding={{ left: 12, right: 12, top: 8, bottom: 8 }} onClick={() => handleFunctionSelection("Ideate")}><Text horizontalAlignText="center" width="fill-parent" fontSize={16} fontWeight={500} fill={'#020202'}>Ideate</Text></AutoLayout>
        <AutoLayout verticalAlignItems="center" width="fill-parent" fill={'#FFF0BB'} stroke = {{ type: 'solid', color: '#D5D5D5' }} cornerRadius={8} padding={{ left: 12, right: 12, top: 8, bottom: 8 }} onClick={() => handleFunctionSelection("Teach me")}><Text horizontalAlignText="center" width="fill-parent" fontSize={16} fontWeight={500} fill={'#020202'}>Teach me</Text></AutoLayout>
        <AutoLayout verticalAlignItems="center" width="fill-parent" fill={'#67B6FF'} stroke = {{ type: 'solid', color: '#D5D5D5' }} cornerRadius={8} padding={{ left: 12, right: 12, top: 8, bottom: 8 }} onClick={() => handleFunctionSelection("Rabbit hole")}><Text horizontalAlignText="center" width="fill-parent" fontSize={16} fontWeight={500} fill={'#020202'}>Rabbit hole</Text></AutoLayout>
        <AutoLayout verticalAlignItems="center" width="fill-parent" fill={'#FF8F76'} stroke = {{ type: 'solid', color: '#D5D5D5' }} cornerRadius={8} padding={{ left: 12, right: 12, top: 8, bottom: 8 }} onClick={() => handleFunctionSelection("Summarize")}><Text horizontalAlignText="center" width="fill-parent" fontSize={16} fontWeight={500} fill={'#020202'}>Summarize</Text></AutoLayout>
        <AutoLayout verticalAlignItems="center" width="fill-parent" fill={'#BBAFFF'} stroke = {{ type: 'solid', color: '#D5D5D5' }} cornerRadius={8} padding={{ left: 12, right: 12, top: 8, bottom: 8 }} onClick={() => handleFunctionSelection("Rewrite")}><Text horizontalAlignText="center" width="fill-parent" fontSize={16} fontWeight={500} fill={'#020202'}>Rewrite</Text></AutoLayout>
        <AutoLayout verticalAlignItems="center" width="fill-parent" fill={'#4E4E4E'} stroke = {{ type: 'solid', color: '#D5D5D5' }} cornerRadius={8} padding={{ left: 12, right: 12, top: 8, bottom: 8 }} onClick={() => handleFunctionSelection("Code")}><Text horizontalAlignText="center" width="fill-parent" fontSize={16} fontWeight={500} fill={'#FFFFFF'}>Code</Text></AutoLayout>
      
      </AutoLayout>
    );
  } else if (activeView === "input") {
    return (
      <AutoLayout 
      fill={'#424242'} 
      cornerRadius={8}
      spacing={16}
      direction="vertical"
      horizontalAlignItems="start"
      padding={{ left: 12, right: 12, top: 12, bottom: 12 }}
      stroke={{
        type: 'solid',
        color: '#D5D5D5',
      }}
    >
      <AutoLayout direction="horizontal" verticalAlignItems="center" spacing={4}>
      <SVG 
        src={backArrowSvg}
        onClick={() => setActiveView("initial")}
      />
        <Text 
        fontSize={20} 
        fontWeight={600} 
        letterSpacing={0.5} 
        fill={'#FAFAFA'}
        horizontalAlignText="center"
        >
        🤖 Jam Copilot
        </Text>
      </AutoLayout>
        <Input
        value={additionalInput}
        placeholder={inputPlaceholder}
        onTextEditEnd={(e) => {setAdditionalInput(e.characters);}}
        fontSize={16}
        fill={'#FFFFFF'}
        placeholderProps={{
          opacity: 0.8,
        }}
        inputFrameProps={{
          fill: "#020202",
          stroke: "#D5D5D5",
          cornerRadius: 8,
          padding: 8,
        }}
        inputBehavior="wrap" // typing 'Enter' blurs and triggers onTextEditEnd, the height of the input frame will auto-resize
        />
        <Input
        value={pendingApiCall}
        placeholder={jamPlaceholder}
        onTextEditEnd={(e) => {setPendingApiCall(e.characters);}}
        fontSize={16}
        inputFrameProps={{
          fill: "#F5F5F5",
          stroke: "#D5D5D5",
          cornerRadius: 8,
          padding: 8,
          height: "hug-contents"
        }}
        inputBehavior="wrap" // typing 'Enter' blurs and triggers onTextEditEnd, the height of the input frame will auto-resize
        />
        <AutoLayout horizontalAlignItems="center" width="fill-parent">
        <AutoLayout 
          verticalAlignItems="center"
          fill={'#6046FF'} 
          cornerRadius={8}
          padding={{ left: 12, right: 12, top: 8, bottom: 8 }}
          width="hug-contents"
          stroke={{
            type: 'solid',
            color: '#2400FF',
          }}
          onClick={handleJamClick}
          >
            <Text fontSize={20} fontWeight={500} fill={'#FAFAFA'} horizontalAlignText="center" width="fill-parent">Let's jam!</Text>
        </AutoLayout>
        </AutoLayout>

    </AutoLayout>
    
    );
  } else if (activeView === "jam") {
  return (
    <AutoLayout 
      fill={'#424242'} 
      cornerRadius={8}
      spacing={16}
      direction="vertical"
      horizontalAlignItems="start"
      padding={{ left: 12, right: 12, top: 12, bottom: 12 }}
      stroke={{
        type: 'solid',
        color: '#D5D5D5',
      }}
    >
      <AutoLayout direction="horizontal" verticalAlignItems="center" spacing={4}>
      <SVG 
        src={backArrowSvg}
        onClick={() => setActiveView("initial")}
        />
        <Text 
        fontSize={20} 
        fontWeight={600} 
        letterSpacing={0.5} 
        fill={'#FAFAFA'}
        horizontalAlignText="center"
        >
        🤖 Jam Copilot
        </Text>
      </AutoLayout>
      <Input
        value={pendingApiCall}
        placeholder={jamPlaceholder}
        onTextEditEnd={(e) => {setPendingApiCall(e.characters);}}
        fontSize={16}
        inputFrameProps={{
          fill: "#F5F5F5",
          stroke: "#D5D5D5",
          cornerRadius: 8,
          padding: 8,
          height: "hug-contents"
        }}
        inputBehavior="wrap" // typing 'Enter' blurs and triggers onTextEditEnd, the height of the input frame will auto-resize
        />
        <AutoLayout horizontalAlignItems="center" width="fill-parent">
          <AutoLayout 
            verticalAlignItems="center"
            fill={'#6046FF'} 
            cornerRadius={8}
            padding={{ left: 12, right: 12, top: 8, bottom: 8 }}
            width="hug-contents"
            stroke={{
              type: 'solid',
              color: '#2400FF',
            }}
            onClick={handleJamClick}
            hoverStyle={{
              fill: '#2400FF',
            }}
            >
              <Text fontSize={20} fontWeight={500} fill={'#FAFAFA'} hoverStyle={{ fill: '#FFFFFF' }} horizontalAlignText="center" width="fill-parent">Let's jam!</Text>
          </AutoLayout>
        </AutoLayout>
    </AutoLayout>
    );
  }
}

widget.register(Copilot)
