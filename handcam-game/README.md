# HandCam Game

Base para un juego de movimiento tipo rhythm/arena controlado con cámara.

## Qué incluye

- MediaPipe Tasks Vision en navegador.
- Tracking de hasta 2 manos.
- Pose corporal para detectar una persona humana frente a la cámara.
- Predicción temporal durante pérdidas breves del tracking.
- Suavizado configurable para reducir jitter sin destruir swings rápidos.
- Cámara a resolución/FPS solicitados sin `object-fit: cover`, para evitar el desfase entre video y overlay.
- Sables visuales rojo/azul orientados a partir de la muñeca y dedos.
- Preparación de estado para integrar orientación del celular vía WebSocket en la siguiente fase.

## Ejecutar

Por seguridad del navegador, usar un servidor local (no abrir el HTML con `file://`). Por ejemplo:

```bash
python -m http.server 8080
```

Luego abrir `http://localhost:8080/handcam-game/`.

Chrome/Edge es la opción recomendada.

## Arquitectura prevista

`PC cámara -> tracking manos/cuerpo -> motor del juego`

`Celular -> giroscopio -> WebSocket -> fusión de orientación de cada mano`

`PC -> pantalla del juego -> espejo/stream al celular`

## Nota importante

El filtro de "humano" no usa un clasificador de especies. Se basa en landmarks de pose humana y geometría corporal; esto evita tratar un perro como jugador en condiciones normales, pero ningún filtro visual es matemáticamente infalible bajo oclusiones extremas o escenas ambiguas.
