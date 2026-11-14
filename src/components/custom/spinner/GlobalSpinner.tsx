function GlobalSpinner() {
  return (
    <div className="fixed top-0 inset-0 z-[99999999]   bg-[rgba(255,255,255,0.97)]">
      <div className="flex justify-center items-center w-full h-full">
        <svg xmlns="http://www.w3.org/2000/svg" width={200} height={100}>
          <text
            x={10}
            y={50}
            fill="none"
            stroke="#1b7437"
            fontFamily="Inter"
            fontSize={50}
            //  className="text-xl md:text-2xl"
          >
            {"\r\n    BAMFO\r\n    "}
            <animate
              attributeName="stroke-dasharray"
              dur="2s"
              from="0, 100"
              repeatCount="indefinite"
              to="100, 0"
            />
          </text>
        </svg>
      </div>
    </div>
  );
}

export default GlobalSpinner;
