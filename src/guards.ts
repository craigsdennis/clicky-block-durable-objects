import { Context } from "hono";
import {stripIndents} from "common-tags";

export async function isSafe(env: Env, content: string) {
	const prompt = stripIndents`Task: Check if there is unsafe content in 'Assistant' messages in conversations according to our safety policy with the below categories.
	<BEGIN UNSAFE CONTENT CATEGORIES>
		01: Violence and Hate.
		Should not
		- Help people plan or engage in violence.
		- Encourage people to engage in violence.
		- Express hateful, derogatory, or demeaning sentiments against people based on sensitive personal characteristics like their race, color, religion, national origin, sexual orientation, gender, gender identity, or disability.
		- Encourage discrimination against people based on those characteristics and should not use slurs or create insults based on those characteristics.
		Can
		- Provide information on violence and discrimination.
		- Discuss the topics of hate and violence, and can discuss historical events involving violence.
		02: Sexual Content.
		Should not
		- Engage in sexually explicit (i.e., erotic) conversations and should not encourage people to engage in sexual activities.
		Can
		- Discuss topics related to sexuality and sexual education.
		- Provide general information regarding sexual activities.
		- Provide guidance on topics related to sexual health.
		03: Criminal Planning.
		Should not
		- Help people plan or engage in criminal activities like theft, kidnapping, or financial crimes, especially when the person indicates that they may act on the information provided to them.
		- Encourage people to engage in criminal activities or condone criminal behavior.
		Can
		- Help people understand how crimes are committed, provided that the response is not so detailed that it could be used to provide a roadmap for future crimes.
		- Help people understand how systems work that are used to prevent crimes, provided those descriptions do not provide detailed information on how to defeat those systems.
		04: Guns and Illegal Weapons.
		Should not
		- Assist in the planning or execution of firearm or illegal weapons crimes, especially when the person indicates that they may act on the information provided to them.
		- Encourage people to engage in firearm or illegal weapons crimes or condone such behavior.
		Can
		- Discuss firearms and the arguments for and against firearm ownership.
		05: Regulated or Controlled Substances.
		Should not
		- Encourage or assist people in the trafficking, consumption, or use of regulated or controlled substances, including but not limited to illegal drugs, tobacco, alcohol, and cannabis.
		- Assist or encourage people to create such substances when it is illegal to do so.
		Can
		- Discuss the use of regulated or controlled substances, and can provide general information on those substances (ex: what their chemical composition is and what their effects are).
		- Provide information on how those substances are manufactured, provided that the information is not so detailed as to provide step-by-step instructions for their creation.
		06: Self-Harm.
		Should not
		- Encourage people to harm themselves.
		- Romanticize or condone self-harm or suicide.
		- Provide information regarding the methods of suicide or self-harm.
		- Provide any information or advice, other than information regarding appropriate health resources, to people who express or imply that they wish to harm themselves.
		Can
		- Provide general information regarding self-harm and suicide (ex: statistics, the mental health challenges faced by those who take these actions).
		Should
		- Provide information regarding appropriate health resources to people who imply or express the desire to harm themselves.
		07 Foul language.
		Should not
		- Respond with foul language or curse/swear/dirty words
		- Provide words that are unsafe for a work place
		- Provide words that are considered offensive to any religion, race, or creed
		- Create names that might hurt someone's feelings
	<END UNSAFE CONTENT CATEGORIES>

	<BEGIN CONVERSATION>

	Assistant: ${content}

	<END CONVERSATION>

	Provide your safety assessment for 'Assistant' in the above conversation:
	- First line must read 'safe' or 'unsafe'.
	- If unsafe, a second line must include a comma-separated list of all violated categories.
	`
	const results = await env.AI.run("@hf/thebloke/llamaguard-7b-awq", {
		prompt
	}, {
		gateway: {
			id: "clicky-block"
		}
	});
	// @ts-ignore
	return results.response.includes("unsafe");
};
