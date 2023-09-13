const { widget } = figma
const { Frame } = widget

function Copilot() {


  return <Frame 
  width={100} 
  height={60} 
  fill={'#6046FF'} 
  cornerRadius={8}
  ></Frame>
  
}

widget.register(Copilot)
