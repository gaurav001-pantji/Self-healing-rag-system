import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

interface MermaidDiagramProps {
  chart: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    
    const renderDiagram = async () => {
      try {
        const sanitizedChart = chart
          .replace(/[\u2192\u27F6\u279D\u279E\u2B46\u27A1]/g, '-->')
          .replace(/[\u21D2\u27F9\u21E8]/g, '==>');
          
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, sanitizedChart);
        if (isMounted) {
          setSvg(renderedSvg);
          setError('');
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to render diagram');
          console.error("Mermaid error:", err);
        }
      }
    };

    if (chart) {
      renderDiagram();
    }

    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-xs text-red-400 font-mono overflow-auto">
        <strong>Diagram Render Error:</strong>
        <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
        <div className="mt-4 text-slate-500">Source:</div>
        <pre className="mt-1 whitespace-pre-wrap text-slate-400">{chart}</pre>
      </div>
    );
  }

  return (
    <div 
      className="bg-[#0b1021]/50 border border-slate-700/50 rounded-xl p-4 my-4 flex justify-center items-center overflow-auto shadow-inner"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
};
