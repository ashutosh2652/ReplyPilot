import { getChannelInfo } from "../services/youtube.service.js";


export const fetchChannel = async (req, res) => {

  try {

    const data = await getChannelInfo();

    res.json(data);

  } catch (error) {

    res.status(500).json(error);

  }

};


