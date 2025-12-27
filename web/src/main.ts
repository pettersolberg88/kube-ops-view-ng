import { Application } from 'pixi.js';
import { Visualizer } from './visualizer';

(async () => {
    const app = new Application();

    await app.init({
        resizeTo: window,
        backgroundColor: 0x1a1a1a,
        antialias: true
    });

    document.getElementById('app')?.appendChild(app.canvas);

    const visualizer = new Visualizer(app);
    visualizer.start();
})();
