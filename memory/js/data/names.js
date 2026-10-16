// Indian name pools for Names & Faces and Phone Numbers, drawn from many regions and communities.
import { shuffle } from '../utils.js';

const words = (s) => s.trim().split(/\s+/);

const FEMALE_FIRST = words(`
  Aarti Aditi Aishwarya Akanksha Amrita Ananya Anjali Ankita Anushka Aparna Archana Arpita Ayesha Bhavana
  Chandni Charu Deepa Deepika Devika Divya Durga Fatima Gauri Gayatri Geeta Harleen Hema Indira Isha Jasleen
  Jaya Jyoti Kajal Kalpana Kamala Kavita Kavya Keerthi Lakshmi Lata Leela Madhuri Mahima Malini Mamta Manisha
  Mariam Meena Meera Megha Monika Nandini Nazia Neha Nikita Nisha Padma Pallavi Pooja Prachi Preeti Priya
  Radha Radhika Rani Rashmi Rekha Revathi Ritu Roshni Rupa Sakshi Sangeeta Sanjana Sapna Sarita Savitri Seema
  Shalini Shanti Shilpa Shobha Shreya Shruti Simran Sneha Sonali Sudha Sujata Suman Sunita Swati Tanvi Tara
  Uma Usha Vandana Varsha Vidya Yamini Zainab
`);

const MALE_FIRST = words(`
  Aakash Abhishek Aditya Ajay Akhil Alok Amit Anand Anil Ankit Anuj Arif Arjun Arun Ashok Balwinder Bharat
  Chetan Deepak Dev Dhruv Dinesh Farhan Gaurav Girish Gopal Harish Hemant Imran Irfan Jaspal Jatin Joseph
  Karan Kartik Kishore Krishna Kunal Lalit Mahesh Manish Manoj Mohan Mukesh Naveen Nikhil Nitin Pankaj Pradeep
  Prakash Pranav Rahul Raj Rajesh Rakesh Ramesh Ranjit Ravi Rohan Rohit Sachin Salman Sameer Sandeep Sanjay
  Santosh Satish Shankar Shiv Siddharth Sukhdev Sunil Suresh Tarun Uday Varun Venkat Vijay Vikram Vinay Vinod
  Vishal Vivek Yash Yogesh Zubair
`);

export const FIRST_NAMES = [...FEMALE_FIRST, ...MALE_FIRST];
export const FEMALE_NAMES = new Set(FEMALE_FIRST);

export const LAST_NAMES = words(`
  Agarwal Ahuja Ansari Arora Banerjee Bansal Baruah Bedi Bhat Bhatia Bose Chacko Chakraborty Chatterjee
  Chaturvedi Chauhan Chopra D'Souza Das Desai Deshpande Dhillon Dubey Dutta Fernandes Gill Gogoi Gomes Gowda
  Grewal Gupta Hegde Hussain Iyengar Iyer Jadhav Jha Joshi Kamath Kapoor Khan Khanna Krishnan Kulkarni Kurian
  Lal Malhotra Mathew Mehta Menon Mirza Mishra Mitra Mukherjee Murthy Naidu Naik Nair Pai Pandey Pandya Parikh
  Patel Patil Pawar Pereira Pillai Prasad Qureshi Raman Rao Rathore Reddy Roy Sandhu Saxena Sen Sethi Shah
  Sharma Sheikh Shetty Shinde Shukla Siddiqui Sidhu Singh Sinha Srivastava Subramanian Syed Thakkar Thakur
  Thomas Tiwari Trivedi Varghese Venkatesan Verma Yadav
`);

/** Unique first names, one per face: female names for faces flagged femme. */
export function namesFor(femmeFlags) {
  const female = shuffle(FEMALE_FIRST);
  const male = shuffle(MALE_FIRST);
  return femmeFlags.map((f) => (f ? female : male).pop());
}
