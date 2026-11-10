
(() => {
  const answer = (input) => {
    const s = typeof input === 'string' ? input : input.map(m => m.content).join('\n');
    if (s.includes("standalone SVG")) return null;
    if (s.includes('Change it like this')) return {name:'Gold star', parts:[{type:'extrude', points:[[0,1],[0.3,0.3],[1,0.3],[0.4,-0.1],[0.6,-0.8],[0,-0.4],[-0.6,-0.8],[-0.4,-0.1],[-1,0.3],[-0.3,0.3]], depth:0.3, color:'#FFD700'}]};
    if (s.includes('Build a 3D model of')) return {name: s.includes('rocket') ? 'Rocket' : 'Star', parts:[{type:'extrude', points:[[0,1],[0.3,0.3],[1,0.3],[0.4,-0.1],[0.6,-0.8],[0,-0.4],[-0.6,-0.8],[-0.4,-0.1],[-1,0.3],[-0.3,0.3]], depth:0.3, color:'#FF7A00'}, {type:'box', size:[0.2,0.2,0.2], pos:[0,0,0]}]};
    if (s.includes("fact checker")) return {summary:'Mostly right.', claims:[{quote:'Die Zelle ist die kleinste Einheit des Lebens', verdict:'correct', why:'Stimmt.', fix:'', source:'', evidence:''},{quote:'Mitochondrien sind Kraftwerke', verdict:'partly', why:'Ungenau.', fix:'Mitochondrien sind die Kraftwerke der Zelle', source:'', evidence:''}]};
    if (s.includes('chart data')) return {title:'Fruit', cats:['Apple','Banana'], series:[{name:'Share', vals:[18,82]}], unit:'%'};
    if (s.includes('mind map')) return {center:'Zelle', branches:[{label:'Teile', children:['Kern','Mitochondrien']},{label:'Funktion', children:['Energie']}]};
    if (s.includes('multiple-choice')) return {title:'Quiz', questions:[{question:'Q1?', options:['a','b','c','d'], answer:1, explain:'x'},{question:'Q2?', options:['a','b','c','d'], answer:0, explain:'y'}]};
    return {};
  };
  window.__prompts = [];
  const sample = async (input, opts) => { window.__prompts.push(typeof input === 'string' ? input : JSON.stringify(input).slice(0, 4000)); await new Promise(r=>setTimeout(r,50)); const s = typeof input==='string'?input:''; if (s.includes('standalone SVG')) return { text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="20" y="20" width="360" height="260" rx="20" fill="#E5383B"/><circle cx="200" cy="150" r="70" fill="#fff" onclick="alert(1)"/><script>alert(2)</script></svg>', truncated:false }; return { text: '## Summary\n- one\n- **two**', truncated:false }; };
  sample.json = async (input, opts) => { window.__prompts.push(typeof input === 'string' ? input : JSON.stringify(input).slice(0, 4000)); await new Promise(r=>setTimeout(r,50)); return answer(input); };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png','image/jpeg'] } });
  window.claude = { use: async (n) => n === 'sample' ? sample : null };
})();
