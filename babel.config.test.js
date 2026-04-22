/** @type {import('@babel/core').TransformOptions} */
module.exports = {
  presets: [
    [
      "next/babel",
      {
        "preset-env": {
          targets: { node: "current" },
        },
      },
    ],
  ],
};
