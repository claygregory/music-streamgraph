
const d3 = require('d3');
const _ = require('lodash');

function artistColorScale(artists) {

  const maxProp = (data, prop) => _.chain(data).map(prop).filter().sortBy().last().value();
  const minProp = (data, prop) => _.chain(data).map(prop).filter().sortBy().first().value();

  const minAge = minProp(artists, 'age');
  const maxAge = maxProp(artists, 'age');

  const minPopularity = minProp(artists, 'popularity');
  const maxPopularity = maxProp(artists, 'popularity');

  const baseScale = d3.scaleSequential(d3.interpolateLab('#446CCF', '#FFFF57'))
    .domain([maxAge, -minAge]);
  
  return key => {
    if (key.match(/other?/))
      return d3.rgb('#F2F3F4');

    const color1 = d3.rgb(baseScale(artists[key].age));
    const color2 = d3.rgb(baseScale(artists[key].age)).brighter(1);

    const secondaryScale = d3.scaleSequential(d3.interpolateLab(color1, color2))
      .domain([minPopularity, maxPopularity]);

    return secondaryScale(artists[key].popularity);
  };

}

function expandData(data, artistKeys) {

  var parseDate = d3.timeParse("%Y-%m-%d");

  return _.map(data, d => {
    const halfOther = d.other / 2.0;
    const merged = _.merge({}, d, { date: parseDate(d['date']), other0: halfOther, other1: halfOther });
    _.each(artistKeys, k => { if (!merged[k]) merged[k] = 0 });

    return merged;
  });
}

const rankArtists = artists => {
  return _.chain(artists)
    .map(a => _.merge(a, { popularity: a.count / a.age}))
    .sortBy('popularity')
    .reverse()
    .map((a, i) => _.merge(a, { popularityRank: i + 1 }))
    .groupBy('id')
    .mapValues(_.first)
    .value();
}

function stackData(data, artists) {

  const artistKeys = _.keys(artists);
  
  const artistsStack = d3.stack()
    .keys(artistKeys)
    .order(d3.stackOrderInsideOut)
    .offset(d3.stackOffsetWiggle);
  
  const stackedArtists = artistsStack(data);
  const artistsPositions = _.chain(stackedArtists)
    .map((l, i) => ({ key: l.key, position: l.index }))
    .groupBy('key')
    .mapValues(v => _.first(v).position)
    .value();

  const sortedKeys = _.concat('other0', _.sortBy(artistKeys, (d, i) => artistsPositions[d]), 'other1');
  
  var stack = d3.stack()
    .keys(sortedKeys)
    .order(d3.stackOrderNone)
    .offset(d3.stackOffsetWiggle);

  return stack(data);
}

function artistInfobox(artists) {

  const infoboxName = d3.select('.infobox-name');
  return key => {
    const artist = artists[key];
    if (artist) {
      infoboxName.text(artist.name);
    } else {
      infoboxName.text('');
    }
  };
}

function render(data, artists) {

  const svg = d3.select('svg');
  const svgNode = svg.node();
  const width = svgNode.getBoundingClientRect().width;
  const height = svgNode.getBoundingClientRect().height;

  const stackedData = stackData(data, artists);

  const x = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain([
      d3.min(stackedData, s => d3.min(s, d=> d[0])),
      d3.max(stackedData, s => d3.max(s, d=> d[1]))
    ])
    .range([height, 0]);

  const color = artistColorScale(artists);
  const infobox = artistInfobox(artists);

  const area = d3.area()
      .curve(d3.curveBasis)
      .x(d => x(d.data.date))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]));

  const layers = svg
    .selectAll('.layer')
    .data(stackedData);

  layers
    .enter()
      .append('path')
      .attr('class', d => d.key.match(/other?/) ? 'layer layer-background' : 'layer layer-artists' )
    .merge(layers)
      .attr('d', area)
      .attr('fill', d => color(d.key));

  layers
    .exit()
    .remove();

  const artistLayers = svg.selectAll('.layer-artists');
  const backgroundLayers = svg.selectAll('.layer-background');

  artistLayers
    .on('mouseover', function (d) {
      infobox(d.key);
      artistLayers
        .attr('fill-opacity', 0.1);
      d3.select(this)
        .classed('selected', true)
        .attr('fill-opacity', 1);

      d3.event.stopPropagation();
    })
    .on('mouseleave', function () {
      infobox(null);
      artistLayers
        .attr('fill-opacity', 1);
      d3.select(this)
        .classed('selected', false);

      d3.event.stopPropagation();
    })
    .on('click', () => {
      d3.event.stopPropagation();
    });


  const clearSelection = () => {
    infobox(null);
    artistLayers
      .attr('fill-opacity', 1)
      .classed('selected', false);
  };
  svg.on('click', clearSelection);
  backgroundLayers.on('click', clearSelection);
  

  const dateExtent = d3.extent(data, d => d.date);
  const minYear = d3.min(data, d => d.date.getFullYear());
  const xAxis = d3.axisBottom(x)
    .tickSizeOuter(0)
    .tickValues(d3.timeYear.range(new Date(minYear + 1, 0, 1), dateExtent[1], 1));

  let axisSelection = svg
    .select('.x-axis');

  if (axisSelection.empty()) {
    axisSelection = svg.append('g')
      .attr('class', 'x-axis');
  }

  axisSelection
    .attr('transform', `translate(0, ${height - 20})`)
    .call(xAxis);


};

d3.json('data.json', function(response) {

  const artists = rankArtists(response.top_artists);
  const data = expandData(response.data, _.keys(artists));

  d3.select('.loading').remove();
  const renderer = _.partial(render, data, artists);
  renderer();

  window.addEventListener("resize", _.debounce(renderer, 250, { leading: true }));

});