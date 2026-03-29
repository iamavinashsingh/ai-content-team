import { useEffect, useRef } from 'react';

export default function NoiseBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let animationId;
    const renderNoise = () => {
      const w = canvas.width;
      const h = canvas.height;
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const val = Math.random() * 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 8; // Very subtle
      }
      ctx.putImageData(imageData, 0, 0);
      animationId = requestAnimationFrame(renderNoise);
    };

    // Throttle to ~4fps for performance
    let frame = 0;
    const throttledRender = () => {
      frame++;
      if (frame % 15 === 0) {
        const w = canvas.width;
        const h = canvas.height;
        const imageData = ctx.createImageData(w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const val = Math.random() * 255;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
          data[i + 3] = 6;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      animationId = requestAnimationFrame(throttledRender);
    };
    throttledRender();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <>
      {/* Mesh gradient */}
      <div className="mesh-gradient" />
      {/* Noise canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-[1] pointer-events-none opacity-40"
        style={{ mixBlendMode: 'overlay' }}
      />
    </>
  );
}
