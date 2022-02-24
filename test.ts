import { useState, useLayoutEffect, useRef } from "react";
import "./styles.css";

const System = () => {
  const [planetAngle, setPlanetAngle] = useState(
    new Array<number>(
      Math.random() * 360,
      Math.random() * 360,
      Math.random() * 360
    )
  );

  const previousTimestampRef = useRef(Number.NaN);
  const animationFrameRef = useRef(0);

  useLayoutEffect(() => {
    const frame: FrameRequestCallback = (time) => {
      if (previousTimestampRef.current) {
        const delta = time - previousTimestampRef.current;

        setPlanetAngle((angles) =>
          angles.map(
            (angle, i) => (angle + 0.072 * delta * (1 / (i + 1))) % 360
          )
        );
      }

      previousTimestampRef.current = time;

      animationFrameRef.current = requestAnimationFrame(frame);
    };

    animationFrameRef.current = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const isoMatrix = new DOMMatrix().rotate(70, 0, -15).translate(0, 0, 0); //.rotate(60, 0, -45);
  const clipPositions = planetAngle.map((angle, i) => {
    return new DOMPoint().matrixTransform(
      new DOMMatrix().rotate(angle).translate(20 + i * 10, 0)
    );
  });
  const planetPositions = planetAngle.map((angle, i) => {
    return new DOMPoint().matrixTransform(
      isoMatrix.multiply(
        new DOMMatrix().rotate(angle).translate(20 + i * 10, 0)
      )
    );
  });

  return (
    <div
      style={{
        position: "fixed",
        left: "100px",
        top: "100px",
        width: "100px",
        height: "100px",
        perspective: "400px",
        transformStyle: "preserve-3d",
        border: "1px solid white"
      }}
    >
      <div
        style={{
          position: "fixed",
          margin: 0,
          padding: 0,
          transformBox: "fill-box",
          transform: isoMatrix.toString(),
          transformOrigin: "50px 50px"
        }}
      >
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            transformOrigin: "center",
            border: "transparent",
            width: "100px",
            height: "100px",
            borderRadius: "30px"
          }}
        />
        <svg
          viewBox="-50 -50 100 100"
          style={{
            margin: 0,
            padding: 0,
            top: 0,
            left: 0,
            width: "100px",
            height: "100px",
            position: "fixed",
            fill: "transparent"
          }}
        >
          <>
          {clipPositions.map((position, i) => {
            return (
              <>
                <mask id={`planetMask${i}`}>
                  <rect x="-50" y="-50" width="100" height="100" fill="white" />
                  <circle
                    cx={clipPositions[i].x}
                    cy={clipPositions[i].y}
                    r="5"
                    fill="black"
                  />
                </mask>
                <circle
                  cx="0"
                  cy="0"
                  r={20 + (i * 10)}
                  fill="transparent"
                  stroke="white"
                  strokeWidth="1px"
                  style={{
                    //clipPath: `path(evenodd, M -50,-50 L 50,-50, L 50,50 L -50,50 L -50,-50 M ${clipPositions[2].x + 5},${clipPositions[2].y + 0} a 5,5 -360 0 0 10,0)`
                    mask: `url(#planetMask${i})`
                    /*maskImage: `radial-gradient(circle at ${
                      clipPositions[2].x - 50
                    }px ${
                      clipPositions[2].y - 50
                    }px, rgba(1,1,1,1) 0%, rgba(1,1,1,1) 50px, rgba(0,0,0,1) 100%)`*/
                  }}
                />
              </>
            )
          })}
          </>
        </svg>
      </div>
      <>
        {planetPositions.map((position, i) => {
          return (
            <div
              style={{
                position: "fixed",
                left: "45px",
                top: "45px",
                width: "10px",
                height: "10px",
                borderRadius: "5px",
                backgroundColor: `${
                  i === 0 ? "red" : i === 1 ? "blue" : "purple"
                }`,
                transformBox: "fill-box",
                transformOrigin: "center",
                transformStyle: "flat",
                transform: `translate3d(${position.x}px, ${position.y}px, ${position.z}px)`
              }}
            />
          );
        })}
      </>

      <div
        style={{
          position: "fixed",
          width: "20px",
          height: "20px",
          top: "40px",
          left: "40px",
          backgroundColor: "orange",
          borderRadius: "10px",
          transformBox: "fill-box",
          transform: "translate3d(0, 0, 0)"
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <div className="App">
      <h1>Hello CodeSandbox</h1>
      <h2>Start editing to see some magic happen!</h2>
      <System />
    </div>
  );
}
